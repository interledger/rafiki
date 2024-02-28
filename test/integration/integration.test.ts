import assert from 'assert'
import {
  OpenPaymentsClientError,
  isPendingGrant,
  WalletAddress
} from '@interledger/open-payments'
import { C9_CONFIG, HLB_CONFIG } from './lib/config'
import { MockASE } from './lib/MockASE'
import { WebhookEventType } from 'mock-account-servicing-lib'
import { wait } from './lib/utils'
import { resourceLimits } from 'worker_threads'

// jest.setTimeout(20000)
// TODO: remove after fixing tests
jest.setTimeout(1_000_000)

describe('Open Payments Flow', (): void => {
  let c9: MockASE
  let hlb: MockASE

  // TODO: can I get this from somewhere instead? config? MockASE accounts?
  // From op client responses (ie use receiverWalletAddress.resourceServer instead of receiverOpenPaymentsHost)?
  const receiverWalletAddressUrl = 'http://localhost:4000/accounts/pfry'
  const receiverOpenPaymentsHost = 'http://localhost:4000'
  const senderOpenPaymentsAuthHost = 'http://localhost:3006'
  const senderOpenPaymentsHost = 'http://localhost:3000'
  const senderWalletAddressUrl = 'https://localhost:3000/accounts/gfranklin'
  const receiverAssetCode = 'USD'
  const receiverAssetScale = 2

  // TODO: Figure out a better way to organize tests so that there arent many tests
  // with side effects (changing this global state) which subsequent tests rely on.
  // Because 🤮

  // Assigned in test: Can Get Existing Wallet Address
  let receiverWalletAddress: WalletAddress

  // Assigned initially in test: Grant Request Incoming Payment
  // Then re-assigned in test: Grant Request Quote
  // - could set new vars but just following whats in postman for now
  let accessToken: string
  let continueToken: string
  let continueId: string
  let tokenId: string

  let incomingPaymentId: string

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
    console.log({ receiverWalletAddress })
    // TODO: better expect.
    // tried jestOpenapi.toSatifyApiSpec but loading throws errors
    // for invalid spec? something not right there because that works in other pkgs
    expect(receiverWalletAddress).toBeTruthy()
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
        url: 'http://localhost:4000/accounts/asmith'
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
        // url: receiverWalletAddress.authServer
        url: 'http://localhost:4006' // should be receiverWalletAddress.authServer but that uses the hostname
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
    const continueId_ = grant.continue.uri.split('/').pop()
    assert(continueId_)
    const tokenId_ = grant.access_token.manage.split('/').pop()
    assert(tokenId_)

    accessToken = grant.access_token.value
    continueToken = grant.continue.access_token.value
    continueId = continueId_
    tokenId = tokenId_
  })

  test('Create Incoming Payment', async (): Promise<void> => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)

    const handleWebhookEventSpy = jest.spyOn(
      hlb.integrationServer.webhookEventHandler,
      'handleWebhookEvent'
    )

    const incomingPayment = await c9.opClient.incomingPayment.create(
      {
        url: receiverOpenPaymentsHost,
        accessToken
      },
      {
        // TODO: Improve this (calling https when we use http elsewhere)
        // requires https because thats whats in the DB because wallet addresses must be created as https (isValidWalletAddressUrl)
        // Comes from OPEN_PAYMENTS_URL env var and seed data.
        walletAddress: 'https://localhost:4000/accounts/pfry',
        // walletAddress: receiverWalletAddressUrl,
        incomingAmount: {
          value: '100',
          assetCode: receiverAssetCode,
          assetScale: receiverAssetScale
        },
        metadata: { description: 'Free Money!' },
        expiresAt: tomorrow.toISOString()
      }
    )

    const incomingPaymentId_ = incomingPayment.id.split('/').pop()
    assert(incomingPaymentId_)
    incomingPaymentId = incomingPaymentId_

    // Delay to ensure webhook is received
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
        url: senderOpenPaymentsAuthHost
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
    const continueId_ = grant.continue.uri.split('/').pop()
    assert(continueId_)
    const tokenId_ = grant.access_token.manage.split('/').pop()
    assert(tokenId_)

    accessToken = grant.access_token.value
    continueToken = grant.continue.access_token.value
    continueId = continueId_
    tokenId = tokenId_
  })

  test('Create Quote', async (): Promise<void> => {
    // TODO: Got this working with hacky stuff which needs real solutions:
    // - changed receiver regex in open payments schema to icnlude http then set this in body: `http://happy-life-bank-test-backend/incoming-payments/${incomingPaymentId}`
    const quote = await c9.opClient.quote.create(
      {
        url: senderOpenPaymentsHost, // TODO: does it need to be https?
        accessToken
      },
      {
        // TODO: Improve this (calling https when we use http elsewhere)
        // requires https because thats whats in the DB because wallet addresses must be created as https (isValidWalletAddressUrl)
        // Comes from OPEN_PAYMENTS_URL env var and seed data.
        walletAddress: 'https://localhost:3000/accounts/gfranklin',
        receiver: `http://happy-life-bank-test-backend/incoming-payments/${incomingPaymentId}`,
        method: 'ilp'
      }
    )
    // TODO: assertions. what to check that isnt tested by virtue of future tests passing?
  })

  test('Grant Request Outgoing Payment', async (): Promise<void> => {
    expect(true).toBe(false)
  })

  // test('Continuation Request', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Create Outgoing Payment', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })
})
