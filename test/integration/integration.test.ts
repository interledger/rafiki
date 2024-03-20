import assert from 'assert'
import { validate as isUuid } from 'uuid'
import {
  isPendingGrant,
  isFinalizedGrant,
  WalletAddress,
  IncomingPayment,
  Quote,
  PendingGrant,
  Grant,
  OutgoingPayment
} from '@interledger/open-payments'
import { C9_CONFIG, HLB_CONFIG } from './lib/config'
import { MockASE } from './lib/mock-ase'
import { WebhookEventType } from 'mock-account-service-lib'
import { parseCookies, poll, pollCondition, wait } from './lib/utils'
import {
  Receiver as ReceiverGql,
  Quote as QuoteGql,
  OutgoingPayment as OutgoingPaymentGql,
  OutgoingPaymentState
} from './lib/generated/graphql'

jest.setTimeout(20000)

describe('Integration tests', (): void => {
  let c9: MockASE
  let hlb: MockASE

  beforeAll(async () => {
    c9 = await MockASE.create(C9_CONFIG)
    hlb = await MockASE.create(HLB_CONFIG)
  })

  afterAll(async () => {
    c9.shutdown()
    hlb.shutdown()
  })

  describe('Open Payments Flow', (): void => {
    const receiverWalletAddressUrl =
      'http://host.docker.internal:4100/accounts/pfry'
    const senderWalletAddressUrl =
      'http://host.docker.internal:3100/accounts/gfranklin'

    let receiverWalletAddress: WalletAddress
    let senderWalletAddress: WalletAddress
    let accessToken: string
    let incomingPayment: IncomingPayment
    let quote: Quote
    let outgoingPaymentGrant: PendingGrant
    let grantContinue: Grant
    let outgoingPayment: OutgoingPayment

    test('Can Get Existing Wallet Address', async (): Promise<void> => {
      receiverWalletAddress = await c9.opClient.walletAddress.get({
        url: receiverWalletAddressUrl
      })
      senderWalletAddress = await c9.opClient.walletAddress.get({
        url: senderWalletAddressUrl
      })

      expect(receiverWalletAddress.id).toBe(
        receiverWalletAddressUrl.replace('http', 'https')
      )
      expect(senderWalletAddress.id).toBe(
        senderWalletAddressUrl.replace('http', 'https')
      )
    })

    test('Can Get Non-Existing Wallet Address', async (): Promise<void> => {
      const notFoundWalletAddress =
        'https://host.docker.internal:4100/accounts/asmith'

      const handleWebhookEventSpy = jest.spyOn(
        hlb.integrationServer.webhookEventHandler,
        'handleWebhookEvent'
      )

      // Poll in case the webhook response to create wallet address is slow,
      // but initial request may very well resolve immediately.
      const walletAddress = await poll(
        async () =>
          c9.opClient.walletAddress.get({
            url: notFoundWalletAddress
          }),
        (responseData) => responseData.id === notFoundWalletAddress,
        5,
        0.5
      )

      assert(walletAddress)
      expect(walletAddress.id).toBe(notFoundWalletAddress)
      expect(handleWebhookEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: WebhookEventType.WalletAddressNotFound,
          data: expect.objectContaining({
            walletAddressUrl: notFoundWalletAddress
          })
        })
      )
    })

    test('Grant Request Incoming Payment', async (): Promise<void> => {
      const grant = await c9.opClient.grant.request(
        {
          url: receiverWalletAddress.authServer
        },
        {
          access_token: {
            access: [
              {
                type: 'incoming-payment',
                actions: ['create', 'read', 'list', 'complete']
              }
            ]
          }
        }
      )

      assert(!isPendingGrant(grant))
      accessToken = grant.access_token.value
    })

    test('Create Incoming Payment', async (): Promise<void> => {
      const now = new Date()
      const tomorrow = new Date(now)
      tomorrow.setDate(now.getDate() + 1)

      const handleWebhookEventSpy = jest.spyOn(
        hlb.integrationServer.webhookEventHandler,
        'handleWebhookEvent'
      )

      incomingPayment = await c9.opClient.incomingPayment.create(
        {
          url: receiverWalletAddress.resourceServer,
          accessToken
        },
        {
          walletAddress: receiverWalletAddressUrl.replace('http', 'https'),
          incomingAmount: {
            value: '100',
            assetCode: receiverWalletAddress.assetCode,
            assetScale: receiverWalletAddress.assetScale
          },
          metadata: { description: 'Free Money!' },
          expiresAt: tomorrow.toISOString()
        }
      )

      await pollCondition(
        () => {
          return handleWebhookEventSpy.mock.calls.some(
            (call) => call[0]?.type === WebhookEventType.IncomingPaymentCreated
          )
        },
        5,
        0.5
      )

      expect(handleWebhookEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: WebhookEventType.IncomingPaymentCreated,
          data: expect.any(Object)
        })
      )
    })

    test('Grant Request Quote', async (): Promise<void> => {
      const grant = await c9.opClient.grant.request(
        {
          url: senderWalletAddress.authServer
        },
        {
          access_token: {
            access: [
              {
                type: 'quote',
                actions: ['read', 'create']
              }
            ]
          }
        }
      )

      assert(!isPendingGrant(grant))
      accessToken = grant.access_token.value
    })

    test('Create Quote', async (): Promise<void> => {
      quote = await c9.opClient.quote.create(
        {
          url: senderWalletAddress.resourceServer,
          accessToken
        },
        {
          walletAddress: senderWalletAddressUrl.replace('http', 'https'),
          receiver: incomingPayment.id.replace('https', 'http'),
          method: 'ilp'
        }
      )
    })

    // --- GRANT CONTINUATION WITH FINISH METHOD ---
    // TODO: Grant Continuation w/ finish in another Open Payments Flow test
    test.skip('Grant Request Outgoing Payment', async (): Promise<void> => {
      const grant = await hlb.opClient.grant.request(
        {
          url: senderWalletAddress.authServer
        },
        {
          access_token: {
            access: [
              {
                type: 'outgoing-payment',
                actions: ['create', 'read', 'list'],
                identifier: senderWalletAddressUrl.replace('http', 'https'),
                limits: {
                  debitAmount: quote.debitAmount,
                  receiveAmount: quote.receiveAmount
                }
              }
            ]
          },
          interact: {
            start: ['redirect'],
            finish: {
              method: 'redirect',
              uri: 'https://example.com',
              nonce: '456'
            }
          }
        }
      )

      assert(isPendingGrant(grant))
      outgoingPaymentGrant = grant

      // Delay following request according to the continue wait time
      await wait((outgoingPaymentGrant.continue.wait ?? 5) * 1000)
    })

    test.skip('Continuation Request', async (): Promise<void> => {
      const { redirect: startInteractionUrl } = outgoingPaymentGrant.interact
      const tokens = startInteractionUrl.split('/interact/')
      const interactId = tokens[1] ? tokens[1].split('/')[0] : null
      const nonce = outgoingPaymentGrant.interact.finish
      assert(interactId)

      // Start interaction
      const interactResponse = await fetch(startInteractionUrl, {
        redirect: 'manual' // dont follow redirects
      })
      expect(interactResponse.status).toBe(302)

      const cookie = parseCookies(interactResponse)

      // Accept
      const acceptResponse = await fetch(
        `${senderWalletAddress.authServer}/grant/${interactId}/${nonce}/accept`,
        {
          method: 'POST',
          headers: {
            'x-idp-secret': 'replace-me',
            cookie
          }
        }
      )
      expect(acceptResponse.status).toBe(202)

      // Finish interaction
      const finishResponse = await fetch(
        `${senderWalletAddress.authServer}/interact/${interactId}/${nonce}/finish`,
        {
          method: 'GET',
          headers: {
            'x-idp-secret': 'replace-me',
            cookie
          },
          redirect: 'manual' // dont follow redirects
        }
      )
      expect(finishResponse.status).toBe(302)

      const redirectURI = finishResponse.headers.get('location')
      assert(redirectURI)

      const url = new URL(redirectURI)
      const interact_ref = url.searchParams.get('interact_ref')
      assert(interact_ref)

      const { access_token, uri } = outgoingPaymentGrant.continue
      const grantContinue_ = await c9.opClient.grant.continue(
        {
          accessToken: access_token.value,
          url: uri
        },
        { interact_ref }
      )
      assert(isFinalizedGrant(grantContinue_))
      grantContinue = grantContinue_
    })
    // --- GRANT CONTINUATION WITH FINISH METHOD ---

    test('Grant Request Outgoing Payment', async (): Promise<void> => {
      const grant = await hlb.opClient.grant.request(
        {
          url: senderWalletAddress.authServer
        },
        {
          access_token: {
            access: [
              {
                type: 'outgoing-payment',
                actions: ['create', 'read', 'list'],
                identifier: senderWalletAddressUrl.replace('http', 'https'),
                limits: {
                  debitAmount: quote.debitAmount,
                  receiveAmount: quote.receiveAmount
                }
              }
            ]
          },
          interact: {
            start: ['redirect']
          }
        }
      )

      assert(isPendingGrant(grant))
      outgoingPaymentGrant = grant

      // Delay following request according to the continue wait time
      await wait((outgoingPaymentGrant.continue.wait ?? 5) * 1000)
    })

    test('Continuation Request', async (): Promise<void> => {
      const { redirect: startInteractionUrl } = outgoingPaymentGrant.interact
      const tokens = startInteractionUrl.split('/interact/')
      const interactId = tokens[1] ? tokens[1].split('/')[0] : null
      const nonce = outgoingPaymentGrant.interact.finish
      assert(interactId)

      // Start interaction
      const interactResponse = await fetch(startInteractionUrl, {
        redirect: 'manual' // dont follow redirects
      })
      expect(interactResponse.status).toBe(302)

      const cookie = parseCookies(interactResponse)

      // Accept
      const acceptResponse = await fetch(
        `${senderWalletAddress.authServer}/grant/${interactId}/${nonce}/accept`,
        {
          method: 'POST',
          headers: {
            'x-idp-secret': 'replace-me',
            cookie
          }
        }
      )

      expect(acceptResponse.status).toBe(202)

      // Finish interaction
      const finishResponse = await fetch(
        `${senderWalletAddress.authServer}/interact/${interactId}/${nonce}/finish`,
        {
          method: 'GET',
          headers: {
            'x-idp-secret': 'replace-me',
            cookie
          }
        }
      )
      expect(finishResponse.status).toBe(202)

      const { access_token, uri } = outgoingPaymentGrant.continue
      const grantContinue_ = await poll(
        async () =>
          c9.opClient.grant.continue({
            accessToken: access_token.value,
            url: uri
          }),
        (responseData) => 'access_token' in responseData,
        20,
        5
      )

      assert(isFinalizedGrant(grantContinue_))
      grantContinue = grantContinue_
    })

    test('Create Outgoing Payment', async (): Promise<void> => {
      const handleWebhookEventSpy = jest.spyOn(
        c9.integrationServer.webhookEventHandler,
        'handleWebhookEvent'
      )

      outgoingPayment = await c9.opClient.outgoingPayment.create(
        {
          url: senderWalletAddress.resourceServer,
          accessToken: grantContinue.access_token.value
        },
        {
          walletAddress: senderWalletAddressUrl.replace('http', 'https'),
          metadata: {},
          quoteId: quote.id
        }
      )

      await pollCondition(
        () => {
          return (
            handleWebhookEventSpy.mock.calls.some(
              (call) =>
                call[0]?.type === WebhookEventType.OutgoingPaymentCreated
            ) &&
            handleWebhookEventSpy.mock.calls.some(
              (call) =>
                call[0]?.type === WebhookEventType.OutgoingPaymentCompleted
            )
          )
        },
        5,
        0.5
      )

      expect(handleWebhookEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: WebhookEventType.OutgoingPaymentCreated,
          data: expect.any(Object)
        })
      )
      expect(handleWebhookEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: WebhookEventType.OutgoingPaymentCompleted,
          data: expect.any(Object)
        })
      )
    })

    test('Get Outgoing Payment', async (): Promise<void> => {
      const id = outgoingPayment.id.split('/').pop()
      assert(id)
      expect(isUuid(id)).toBe(true)

      const outgoingPayment_ = await c9.opClient.outgoingPayment.get({
        url: `${senderWalletAddress.resourceServer}/outgoing-payments/${id}`,
        accessToken: grantContinue.access_token.value
      })

      expect(outgoingPayment_.id).toBe(outgoingPayment.id)
    })
  })

  describe('Peer to Peer Flow', (): void => {
    const receiverWalletAddressUrl =
      'https://host.docker.internal:4100/accounts/pfry'
    const amountValueToSend = '500'

    let gfranklinWalletAddressId: string
    let receiver: ReceiverGql
    let quote: QuoteGql
    let outgoingPayment: OutgoingPaymentGql

    beforeAll(async () => {
      const gfranklinWalletAddress = await c9.accounts.getByWalletAddressUrl(
        'https://host.docker.internal:3100/accounts/gfranklin'
      )
      assert(gfranklinWalletAddress?.walletAddressID)
      gfranklinWalletAddressId = gfranklinWalletAddress.walletAddressID
    })

    test('Create Receiver (remote Incoming Payment)', async (): Promise<void> => {
      const handleWebhookEventSpy = jest.spyOn(
        hlb.integrationServer.webhookEventHandler,
        'handleWebhookEvent'
      )
      const response = await c9.adminClient.createReceiver({
        metadata: {
          description: 'For lunch!'
        },
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: amountValueToSend as unknown as bigint
        },
        walletAddressUrl: receiverWalletAddressUrl
      })

      expect(response.code).toBe('200')
      assert(response.receiver)

      receiver = response.receiver

      await pollCondition(
        () => {
          return handleWebhookEventSpy.mock.calls.some(
            (call) => call[0]?.type === WebhookEventType.IncomingPaymentCreated
          )
        },
        5,
        0.5
      )

      expect(handleWebhookEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: WebhookEventType.IncomingPaymentCreated,
          data: expect.any(Object)
        })
      )
    })
    test('Create Quote', async (): Promise<void> => {
      const response = await c9.adminClient.createQuote({
        walletAddressId: gfranklinWalletAddressId,
        receiver: receiver.id
      })

      expect(response.code).toBe('200')
      assert(response.quote)

      quote = response.quote
    })
    test('Create Outgoing Payment', async (): Promise<void> => {
      const handleWebhookEventSpy = jest.spyOn(
        c9.integrationServer.webhookEventHandler,
        'handleWebhookEvent'
      )

      const response = await c9.adminClient.createOutgoingPayment({
        walletAddressId: gfranklinWalletAddressId,
        quoteId: quote.id
      })

      expect(response.code).toBe('200')
      assert(response.payment)

      outgoingPayment = response.payment

      await pollCondition(
        () => {
          return (
            handleWebhookEventSpy.mock.calls.some(
              (call) =>
                call[0]?.type === WebhookEventType.OutgoingPaymentCreated
            ) &&
            handleWebhookEventSpy.mock.calls.some(
              (call) =>
                call[0]?.type === WebhookEventType.OutgoingPaymentCompleted
            )
          )
        },
        5,
        0.5
      )

      expect(handleWebhookEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: WebhookEventType.OutgoingPaymentCreated,
          data: expect.any(Object)
        })
      )
      expect(handleWebhookEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: WebhookEventType.OutgoingPaymentCompleted,
          data: expect.any(Object)
        })
      )
    })
    test('Get Outgoing Payment', async (): Promise<void> => {
      const payment = await c9.adminClient.getOutgoingPayment(
        outgoingPayment.id
      )
      expect(payment.state).toBe(OutgoingPaymentState.Completed)
      expect(payment.receiveAmount.value).toBe(amountValueToSend)
      expect(payment.sentAmount.value).toBe(amountValueToSend)
    })
  })
})
