import assert from 'assert'
import {
  OpenPaymentsClientError,
  isPendingGrant,
  WalletAddress,
  IncomingPayment,
  Quote
} from '@interledger/open-payments'
import { C9_CONFIG, HLB_CONFIG } from './lib/config'
import { MockASE } from './lib/MockASE'
import { WebhookEventType } from 'mock-account-servicing-lib'
import { wait } from './lib/utils'

jest.setTimeout(20000)

describe('Open Payments Flow', (): void => {
  let c9: MockASE
  let hlb: MockASE

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
  // Then re-assigned in test: Grant Request Quote
  // - could set new vars but just following whats in postman for now
  let accessToken: string

  // Assigned in Create Incoming Payment
  let incomingPayment: IncomingPayment

  // Assigned in Create Quote
  let quote: Quote

  // Assigned in Grant Request Outgoing Payment
  let continueId: string

  beforeAll(async () => {
    c9 = await MockASE.create(C9_CONFIG)
    hlb = await MockASE.create(HLB_CONFIG)
  })

  afterAll(async () => {
    c9.shutdown()
    hlb.shutdown()
  })

  test('Can Get Existing Wallet Address', async (): Promise<void> => {
    receiverWalletAddress = await c9.opClient.walletAddress.get({
      url: receiverWalletAddressUrl
    })
    senderWalletAddress = await c9.opClient.walletAddress.get({
      url: senderWalletAddressUrl
    })
    console.log({ receiverWalletAddress, senderWalletAddress })
    // TODO: better expect.
    // tried jestOpenapi.toSatifyApiSpec but loading throws errors
    // for invalid spec? something not right there because that works in other pkgs
    expect(receiverWalletAddress).toBeTruthy()
    expect(senderWalletAddress).toBeTruthy()
  })

  // TODO: fix account not found error in webhook handler
  test.skip('Get Non-Existing Wallet Address Triggers Not Found Webhook Event', async (): Promise<void> => {
    let walletAddress

    const handleWebhookEventSpy = jest.spyOn(
      c9.integrationServer.webhookEventHandler,
      'handleWebhookEvent'
    )
    try {
      walletAddress = await c9.opClient.walletAddress.get({
        url: 'http://host.docker.internal:4000/accounts/asmith'
      })
    } catch (e) {
      // 404 error from client is expected - swallow it
      if (!(e instanceof OpenPaymentsClientError)) throw e
    }

    expect(walletAddress).toBeUndefined()
    expect(handleWebhookEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WebhookEventType.WalletAddressNotFound,
        data: expect.any(Object)
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
              identifier: senderWalletAddressUrl,
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
    const continueId_ = grant.continue.uri.split('/').pop()
    assert(continueId_)
    continueId = continueId_
  })

  // test('Continuation Request', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Create Outgoing Payment', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })
})
