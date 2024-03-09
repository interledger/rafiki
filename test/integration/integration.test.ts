import assert from 'assert'
import { validate as isUuid } from 'uuid'
import {
  OpenPaymentsClientError,
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
import { MockASE } from './lib/MockASE'
import { GraphqlTypes, WebhookEventType } from 'mock-account-servicing-lib'
import { parseCookies, poll, wait } from './lib/utils'

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
      'http://host.docker.internal:4000/accounts/pfry'
    const senderWalletAddressUrl =
      'http://host.docker.internal:3000/accounts/gfranklin'

    // TODO: Is there a better way to organize these tests so that there arent many tests
    // with side effects (changing this global state) which subsequent tests rely on? In
    // some ways these tests should all be 1 since they aren't independant but I would
    // prefer not to make them literally 1 test for readability of code and results and
    // easier developement and debugging.

    // Assigned in test: Can Get Existing Wallet Address
    let receiverWalletAddress: WalletAddress
    let senderWalletAddress: WalletAddress

    // Assigned initially in test: Grant Request Incoming Payment
    // Then re-assigned in test: Grant Request Quote and Grant Request Outgoing Payment
    // - could set new vars but just following whats in postman for now
    let accessToken: string

    // Assigned in Create Incoming Payment
    let incomingPayment: IncomingPayment

    // Assigned in Create Quote
    let quote: Quote

    // Assigned in Grant Request Outgoing Payment
    // let continueId: string
    let outgoingPaymentGrant: PendingGrant

    // set in Continuation Request
    let grantContinue: Grant

    // set in Create Outgoing Payment
    let outgoingPayment: OutgoingPayment

    test('Can Get Existing Wallet Address', async (): Promise<void> => {
      receiverWalletAddress = await c9.opClient.walletAddress.get({
        url: receiverWalletAddressUrl
      })
      senderWalletAddress = await c9.opClient.walletAddress.get({
        url: senderWalletAddressUrl
      })

      console.log({ receiverWalletAddress, senderWalletAddress })

      expect(receiverWalletAddress.id).toBe(
        receiverWalletAddressUrl.replace('http', 'https')
      )
      expect(senderWalletAddress.id).toBe(
        senderWalletAddressUrl.replace('http', 'https')
      )
    })

    test('Can Get Non-Existing Wallet Address', async (): Promise<void> => {
      const notFoundWalletAddress =
        'https://host.docker.internal:4000/accounts/asmith'

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

      console.log({ grant })

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

      console.log({ incomingPayment })

      // Delay gives time for webhook to be received
      await wait(1000)
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

      console.log(JSON.stringify(grant, null, 2))

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

      console.log({ quote })
    })

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
            start: ['redirect'],
            finish: {
              method: 'redirect',
              uri: 'https://example.com',
              nonce: '456'
            }
          }
        }
      )

      console.log({ grant })

      assert(isPendingGrant(grant))
      outgoingPaymentGrant = grant
    })

    test('Continuation Request', async (): Promise<void> => {
      // Extract interact ID from the redirect URL
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

      await wait((outgoingPaymentGrant.continue.wait ?? 5) * 1000)

      const grantContinue_ = await c9.opClient.grant.continue(
        {
          accessToken: access_token.value,
          url: uri
        },
        { interact_ref }
      )
      console.log(JSON.stringify(grantContinue_, null, 2))
      assert(isFinalizedGrant(grantContinue_))
      grantContinue = grantContinue_
    })

    // ----------------------------------------------------------
    // Grant Continuation via Polling.
    // Alternative to gettiang the redirect url with interact_ref.
    // TODO: Test this way as well when OP client doesnt require interact_ref.
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
                identifier: senderWalletAddressUrl,
                limits: {
                  debitAmount: quote.debitAmount,
                  receiveAmount: quote.receiveAmount
                }
              }
            ]
          },
          interact: {
            start: ['redirect']
            // finish: {
            //   method: 'redirect',
            //   uri: 'https://example.com',
            //   nonce: '456'
            // }
          }
        }
      )

      console.log({ grant })

      assert(isPendingGrant(grant))
      outgoingPaymentGrant = grant
    })

    test.skip('Continuation Request', async (): Promise<void> => {
      const { access_token, uri } = outgoingPaymentGrant.continue
      const grantContinue = await poll(
        async () =>
          c9.opClient.grant.continue(
            {
              accessToken: access_token.value,
              url: uri
            },
            // TODO: pull in latest spec which shouldn't need interact_ref
            { interact_ref: '' }
          ),
        (responseData) => 'accessToken' in responseData,
        // TODO: update timing to be based on the grant.continue.wait
        10,
        2
      )
      console.log({ grantContinue })
      expect(true).toBe(true)
    })
    // ----------------------------------------------------------

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
      console.log({ outgoingPayment })
      // Delay gives time for webhooks to be received
      await wait(1000)
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
      console.log({ outgoingPayment_ })
    })
  })

  describe('Peer to Peer Flow', (): void => {
    const receiverWalletAddressUrl =
      'https://host.docker.internal:4000/accounts/pfry'
    const amountValueToSend = '500'

    let gfranklinWalletAddressId: string
    let receiver: GraphqlTypes.Receiver
    let quote: GraphqlTypes.Quote
    let outgoingPayment: GraphqlTypes.OutgoingPayment

    beforeAll(async () => {
      const gfranklinWalletAddress = await c9.accounts.getByWalletAddressUrl(
        'https://host.docker.internal:3000/accounts/gfranklin'
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

      // Delay gives time for webhook to be received
      await wait(1000)
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

      // Delay gives time for payment to complete and for webhooks to be received
      await wait(1000)
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
      expect(payment.state).toBe(GraphqlTypes.OutgoingPaymentState.Completed)
      expect(payment.receiveAmount.value).toBe(amountValueToSend)
      expect(payment.sentAmount.value).toBe(amountValueToSend)
    })
  })
})
