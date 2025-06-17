import assert from 'assert'
import { MockASE, C9_CONFIG, HLB_CONFIG } from 'test-lib'
import { WebhookEventType } from 'mock-account-service-lib'
import { poll } from './lib/utils'
import { TestActions, createTestActions } from './lib/test-actions'
import { IncomingPaymentState } from 'test-lib/dist/generated/graphql'

jest.setTimeout(20_000)

describe('Integration tests', (): void => {
  let c9: MockASE
  let hlb: MockASE

  beforeAll(async () => {
    try {
      c9 = await MockASE.create(C9_CONFIG)
      hlb = await MockASE.create(HLB_CONFIG)
    } catch (e) {
      console.error(e)
      // Prevents jest from running all tests, which obfuscates errors in beforeAll
      // https://github.com/jestjs/jest/issues/2713
      process.exit(1)
    }
  })

  afterAll(async () => {
    c9.shutdown()
    hlb.shutdown()
  })

  // Individual requests
  describe('Requests', (): void => {
    test('Can Get Non-Existing Wallet Address', async (): Promise<void> => {
      const notFoundWalletAddress =
        'https://happy-life-bank-test-backend:4100/accounts/asmith'

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
  })

  describe('Flows', () => {
    describe('Remote', () => {
      let testActions: TestActions

      beforeAll(async () => {
        testActions = createTestActions({ sendingASE: c9, receivingASE: hlb })
      })

      test('Open Payments with Continuation via Polling', async (): Promise<void> => {
        const {
          grantRequestIncomingPayment,
          createIncomingPayment,
          grantRequestQuote,
          createQuote,
          grantRequestOutgoingPayment,
          pollGrantContinue,
          createOutgoingPayment,
          getOutgoingPayment,
          getPublicIncomingPayment
        } = testActions.openPayments
        const { consentInteraction } = testActions

        const receiverWalletAddressUrl =
          'https://happy-life-bank-test-backend:4100/accounts/pfry'
        const senderWalletAddressUrl =
          'https://cloud-nine-wallet-test-backend:3100/accounts/gfranklin'
        const amountValueToSend = '100'

        const receiverWalletAddress = await c9.opClient.walletAddress.get({
          url: receiverWalletAddressUrl
        })
        expect(receiverWalletAddress.id).toBe(receiverWalletAddressUrl)

        const senderWalletAddress = await c9.opClient.walletAddress.get({
          url: senderWalletAddressUrl
        })
        expect(senderWalletAddress.id).toBe(senderWalletAddressUrl)

        let incomingPaymentGrant
        try {
          incomingPaymentGrant = await grantRequestIncomingPayment(
            receiverWalletAddress
          )
        } catch (err) {
          console.log('ERROR: ', err)
          throw err
        }

        const incomingPayment = await createIncomingPayment(
          receiverWalletAddress,
          incomingPaymentGrant.access_token.value,
          { amountValueToSend, tenantId: hlb.config.operatorTenantId }
        )
        const quoteGrant = await grantRequestQuote(senderWalletAddress)
        const quote = await createQuote(
          senderWalletAddress,
          quoteGrant.access_token.value,
          incomingPayment
        )
        const outgoingPaymentGrant = await grantRequestOutgoingPayment(
          senderWalletAddress,
          {
            receiveAmount: quote.receiveAmount
          }
        )
        await consentInteraction(outgoingPaymentGrant, senderWalletAddress)
        const grantContinue = await pollGrantContinue(outgoingPaymentGrant)
        const outgoingPayment = await createOutgoingPayment(
          senderWalletAddress,
          grantContinue,
          {
            metadata: {},
            quoteId: quote.id
          }
        )
        const outgoingPayment_ = await getOutgoingPayment(
          outgoingPayment.id,
          grantContinue
        )

        expect(outgoingPayment_.receiveAmount.value).toBe(amountValueToSend)
        expect(outgoingPayment_.sentAmount.value).toBe(amountValueToSend)

        await getPublicIncomingPayment(incomingPayment.id, amountValueToSend)

        const incomingPayment_ = await hlb.opClient.incomingPayment.getPublic({
          url: incomingPayment.id
        })
        assert(incomingPayment_.receivedAmount)
        expect(incomingPayment_.receivedAmount.value).toBe(amountValueToSend)
      })
      test('Open Payments with Continuation via finish method', async (): Promise<void> => {
        const {
          grantRequestIncomingPayment,
          createIncomingPayment,
          grantRequestQuote,
          createQuote,
          grantRequestOutgoingPayment,
          grantContinue,
          createOutgoingPayment,
          getOutgoingPayment,
          getPublicIncomingPayment
        } = testActions.openPayments
        const { consentInteractionWithInteractRef } = testActions

        const receiverWalletAddressUrl =
          'https://happy-life-bank-test-backend:4100/accounts/pfry'
        const senderWalletAddressUrl =
          'https://cloud-nine-wallet-test-backend:3100/accounts/gfranklin'
        const amountValueToSend = '100'

        const receiverWalletAddress = await c9.opClient.walletAddress.get({
          url: receiverWalletAddressUrl
        })
        expect(receiverWalletAddress.id).toBe(receiverWalletAddressUrl)

        const senderWalletAddress = await c9.opClient.walletAddress.get({
          url: senderWalletAddressUrl
        })
        expect(senderWalletAddress.id).toBe(senderWalletAddressUrl)

        const incomingPaymentGrant = await grantRequestIncomingPayment(
          receiverWalletAddress
        )
        const incomingPayment = await createIncomingPayment(
          receiverWalletAddress,
          incomingPaymentGrant.access_token.value,
          { amountValueToSend, tenantId: hlb.config.operatorTenantId }
        )
        const quoteGrant = await grantRequestQuote(senderWalletAddress)
        const quote = await createQuote(
          senderWalletAddress,
          quoteGrant.access_token.value,
          incomingPayment
        )
        const outgoingPaymentGrant = await grantRequestOutgoingPayment(
          senderWalletAddress,
          { receiveAmount: quote.receiveAmount },
          {
            method: 'redirect',
            uri: 'https://example.com',
            nonce: '456'
          }
        )
        const interactRef = await consentInteractionWithInteractRef(
          outgoingPaymentGrant,
          senderWalletAddress
        )
        const finalizedGrant = await grantContinue(
          outgoingPaymentGrant,
          interactRef
        )
        const outgoingPayment = await createOutgoingPayment(
          senderWalletAddress,
          finalizedGrant,
          {
            metadata: {},
            quoteId: quote.id
          }
        )
        const outgoingPayment_ = await getOutgoingPayment(
          outgoingPayment.id,
          finalizedGrant
        )

        expect(outgoingPayment_.receiveAmount.value).toBe(amountValueToSend)
        expect(outgoingPayment_.sentAmount.value).toBe(amountValueToSend)

        await getPublicIncomingPayment(incomingPayment.id, amountValueToSend)
      })
      test('Open Payments Multiple Outgoing Payments into Incoming Payment', async (): Promise<void> => {
        const {
          grantRequestIncomingPayment,
          createIncomingPayment,
          grantRequestOutgoingPayment,
          pollGrantContinue,
          createOutgoingPayment,
          getOutgoingPayment,
          getPublicIncomingPayment
        } = testActions.openPayments
        const { consentInteraction } = testActions

        const receiverWalletAddressUrl =
          'https://happy-life-bank-test-backend:4100/accounts/pfry'
        const senderWalletAddressUrl =
          'https://cloud-nine-wallet-test-backend:3100/accounts/gfranklin'

        const receiverWalletAddress = await c9.opClient.walletAddress.get({
          url: receiverWalletAddressUrl
        })
        expect(receiverWalletAddress.id).toBe(receiverWalletAddressUrl)

        const senderWalletAddress = await c9.opClient.walletAddress.get({
          url: senderWalletAddressUrl
        })
        expect(senderWalletAddress.id).toBe(senderWalletAddressUrl)

        const grantValue = 100n

        const incomingPaymentGrant = await grantRequestIncomingPayment(
          receiverWalletAddress
        )
        const incomingPayment = await createIncomingPayment(
          receiverWalletAddress,
          incomingPaymentGrant.access_token.value,
          { tenantId: hlb.config.operatorTenantId }
        )

        const outgoingPaymentGrant = await grantRequestOutgoingPayment(
          senderWalletAddress,
          {
            debitAmount: {
              assetCode: senderWalletAddress.assetCode,
              assetScale: senderWalletAddress.assetScale,
              value: String(grantValue)
            }
          }
        )
        await consentInteraction(outgoingPaymentGrant, senderWalletAddress)
        const grantContinue = await pollGrantContinue(outgoingPaymentGrant)

        const debitAmount = {
          assetCode: senderWalletAddress.assetCode,
          assetScale: senderWalletAddress.assetScale,
          value: '50'
        }

        const outgoingPayment1 = await createOutgoingPayment(
          senderWalletAddress,
          grantContinue,
          {
            incomingPayment: incomingPayment.id,
            debitAmount
          }
        )

        await poll(
          async () => getOutgoingPayment(outgoingPayment1.id, grantContinue),
          (responseData) => BigInt(responseData.sentAmount.value) > 0n,
          5,
          0.5
        )

        expect(outgoingPayment1.debitAmount).toMatchObject(debitAmount)

        const outgoingPayment2 = await createOutgoingPayment(
          senderWalletAddress,
          grantContinue,
          {
            incomingPayment: incomingPayment.id,
            debitAmount
          }
        )

        await poll(
          async () => getOutgoingPayment(outgoingPayment2.id, grantContinue),
          (responseData) => BigInt(responseData.sentAmount.value) > 0n,
          5,
          0.5
        )

        await getPublicIncomingPayment(incomingPayment.id, '98') // adjusted for ILP slippage
      })
      test('Peer to Peer', async (): Promise<void> => {
        const {
          createReceiver,
          createQuote,
          createOutgoingPayment,
          getOutgoingPayment,
          getIncomingPayment
        } = testActions.admin

        const senderWalletAddress = await c9.accounts.getByWalletAddressUrl(
          'https://cloud-nine-wallet-test-backend:3100/accounts/gfranklin'
        )
        assert(senderWalletAddress?.walletAddressID)
        const senderWalletAddressId = senderWalletAddress.walletAddressID
        const value = '500'
        const createReceiverInput = {
          metadata: {
            description: 'For lunch!'
          },
          incomingAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: value as unknown as bigint
          },
          walletAddressUrl:
            'https://happy-life-bank-test-backend:4100/accounts/pfry'
        }

        const receiver = await createReceiver(createReceiverInput)
        const quote = await createQuote({
          walletAddressId: senderWalletAddressId,
          receiver: receiver.id
        })
        const outgoingPayment = await createOutgoingPayment(
          senderWalletAddressId,
          quote
        )
        const outgoingPayment_ = await getOutgoingPayment(
          outgoingPayment.id,
          value
        )
        expect(outgoingPayment_.sentAmount.value).toBe(BigInt(value))

        const incomingPaymentId = receiver.id.split('/').slice(-1)[0]
        const incomingPayment = await getIncomingPayment(incomingPaymentId)
        expect(incomingPayment.receivedAmount.value).toBe(BigInt(value))
        expect(incomingPayment.state).toBe(IncomingPaymentState.Completed)
      })
      test('Peer to Peer - Cross Currency', async (): Promise<void> => {
        const {
          createReceiver,
          createQuote,
          createOutgoingPayment,
          getOutgoingPayment,
          getIncomingPayment
        } = testActions.admin

        const senderWalletAddress = await c9.accounts.getByWalletAddressUrl(
          'https://cloud-nine-wallet-test-backend:3100/accounts/gfranklin'
        )
        assert(senderWalletAddress)
        const senderAssetCode = senderWalletAddress.assetCode
        const senderWalletAddressId = senderWalletAddress.walletAddressID
        const value = '500'
        const createReceiverInput = {
          metadata: {
            description: 'cross-currency'
          },
          incomingAmount: {
            assetCode: 'EUR',
            assetScale: 2,
            value: value as unknown as bigint
          },
          walletAddressUrl:
            'https://happy-life-bank-test-backend:4100/accounts/lars'
        }

        const receiver = await createReceiver(createReceiverInput)
        assert(receiver.incomingAmount)

        const quote = await createQuote({
          walletAddressId: senderWalletAddressId,
          receiver: receiver.id
        })
        const outgoingPayment = await createOutgoingPayment(
          senderWalletAddressId,
          quote
        )
        const completedOutgoingPayment = await getOutgoingPayment(
          outgoingPayment.id,
          value
        )

        const receiverAssetCode = receiver.incomingAmount.assetCode
        const exchangeRate =
          hlb.config.seed.rates[senderAssetCode][receiverAssetCode]

        // Expected amounts depend on the configuration of asset codes, scale, exchange rate, and fees.
        assert(receiverAssetCode === 'EUR')
        assert(senderAssetCode === 'USD')
        assert(
          receiver.incomingAmount.assetScale === senderWalletAddress.assetScale
        )
        assert(senderWalletAddress.assetScale === 2)
        assert(exchangeRate === 0.91)
        expect(completedOutgoingPayment.receiveAmount).toMatchObject({
          assetCode: 'EUR',
          assetScale: 2,
          value: 500n
        })
        expect(completedOutgoingPayment.debitAmount).toMatchObject({
          assetCode: 'USD',
          assetScale: 2,
          value: 556n // with ILP slippage
        })
        expect(completedOutgoingPayment.sentAmount).toMatchObject({
          assetCode: 'USD',
          assetScale: 2,
          value: 550n
        })

        const incomingPaymentId = receiver.id.split('/').slice(-1)[0]
        const incomingPayment = await getIncomingPayment(incomingPaymentId)
        expect(incomingPayment.receivedAmount).toMatchObject({
          assetCode: 'EUR',
          assetScale: 2,
          value: 500n
        })
        expect(incomingPayment.state).toBe(IncomingPaymentState.Completed)
      })
    })
    describe('Local', () => {
      let testActions: TestActions

      beforeAll(async () => {
        testActions = createTestActions({ sendingASE: c9, receivingASE: c9 })
      })

      test('Peer to Peer', async (): Promise<void> => {
        const {
          createReceiver,
          createQuote,
          createOutgoingPayment,
          getOutgoingPayment,
          getIncomingPayment
        } = testActions.admin

        const senderWalletAddress = await c9.accounts.getByWalletAddressUrl(
          'https://cloud-nine-wallet-test-backend:3100/accounts/gfranklin'
        )
        assert(senderWalletAddress?.walletAddressID)
        const senderWalletAddressId = senderWalletAddress.walletAddressID
        const value = '500'
        const createReceiverInput = {
          metadata: {
            description: 'For lunch!'
          },
          incomingAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: value as unknown as bigint
          },
          walletAddressUrl:
            'https://cloud-nine-wallet-test-backend:3100/accounts/bhamchest'
        }

        const receiver = await createReceiver(createReceiverInput)
        const quote = await createQuote({
          walletAddressId: senderWalletAddressId,
          receiver: receiver.id
        })
        const outgoingPayment = await createOutgoingPayment(
          senderWalletAddressId,
          quote
        )
        const outgoingPayment_ = await getOutgoingPayment(
          outgoingPayment.id,
          value
        )
        expect(outgoingPayment_.sentAmount.value).toBe(BigInt(value))

        const incomingPaymentId = receiver.id.split('/').slice(-1)[0]
        const incomingPayment = await getIncomingPayment(incomingPaymentId)
        expect(incomingPayment.receivedAmount.value).toBe(BigInt(value))
        expect(incomingPayment.state).toBe(IncomingPaymentState.Completed)
      })

      test('Peer to Peer - Fixed Send', async (): Promise<void> => {
        const {
          createReceiver,
          createQuote,
          createOutgoingPayment,
          getOutgoingPayment,
          getIncomingPayment
        } = testActions.admin

        const receiver = await createReceiver({
          metadata: {
            description: 'For lunch!'
          },
          walletAddressUrl:
            'https://cloud-nine-wallet-test-backend:3100/accounts/bhamchest'
        })
        expect(receiver.id).toBeDefined()

        const senderWalletAddress = await c9.accounts.getByWalletAddressUrl(
          'https://cloud-nine-wallet-test-backend:3100/accounts/gfranklin'
        )
        assert(senderWalletAddress?.walletAddressID)
        const senderWalletAddressId = senderWalletAddress.walletAddressID

        const createQuoteInput = {
          walletAddressId: senderWalletAddressId,
          receiver: receiver.id,
          debitAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: '500' as unknown as bigint
          }
        }
        const quote = await createQuote(createQuoteInput)
        expect(quote.id).toBeDefined()

        const outgoingPayment = await createOutgoingPayment(
          senderWalletAddressId,
          quote
        )
        expect(outgoingPayment.id).toBeDefined()

        const outgoingPayment_ = await getOutgoingPayment(
          outgoingPayment.id,
          String(quote.receiveAmount.value)
        )
        expect(outgoingPayment_.sentAmount.value).toBe(
          BigInt(quote.receiveAmount.value)
        )

        expect(outgoingPayment_.state).toBe('COMPLETED')

        const incomingPaymentId = receiver.id.split('/').slice(-1)[0]
        const incomingPayment = await getIncomingPayment(incomingPaymentId)

        expect(incomingPayment.receivedAmount).toMatchObject({
          assetCode: 'USD',
          assetScale: 2,
          value: BigInt(quote.receiveAmount.value)
        })
      })

      test('Peer to Peer - Cross Currency', async (): Promise<void> => {
        const {
          createReceiver,
          createQuote,
          createOutgoingPayment,
          getOutgoingPayment,
          getIncomingPayment
        } = testActions.admin

        const senderWalletAddress = await c9.accounts.getByWalletAddressUrl(
          'https://cloud-nine-wallet-test-backend:3100/accounts/gfranklin'
        )
        assert(senderWalletAddress)
        const senderAssetCode = senderWalletAddress.assetCode
        const senderWalletAddressId = senderWalletAddress.walletAddressID
        const createReceiverInput = {
          metadata: {
            description: 'cross-currency'
          },
          incomingAmount: {
            assetCode: 'EUR',
            assetScale: 2,
            value: '500' as unknown as bigint
          },
          walletAddressUrl:
            'https://cloud-nine-wallet-test-backend:3100/accounts/lrossi'
        }
        const receiver = await createReceiver(createReceiverInput)
        assert(receiver.incomingAmount)

        const quote = await createQuote({
          walletAddressId: senderWalletAddressId,
          receiver: receiver.id
        })
        const outgoingPayment = await createOutgoingPayment(
          senderWalletAddressId,
          quote
        )
        const completedOutgoingPayment = await getOutgoingPayment(
          outgoingPayment.id,
          String(createReceiverInput.incomingAmount.value)
        )

        const receiverAssetCode = receiver.incomingAmount.assetCode
        const exchangeRate =
          c9.config.seed.rates[senderAssetCode][receiverAssetCode]

        // Expected amounts depend on the configuration of asset codes, scale, exchange rate, and fees.
        assert(receiverAssetCode === 'EUR')
        assert(senderAssetCode === 'USD')
        assert(
          receiver.incomingAmount.assetScale === senderWalletAddress.assetScale
        )
        assert(senderWalletAddress.assetScale === 2)
        assert(exchangeRate === 0.91)
        expect(completedOutgoingPayment.receiveAmount).toMatchObject({
          assetCode: 'EUR',
          assetScale: 2,
          value: 500n
        })
        expect(completedOutgoingPayment.debitAmount).toMatchObject({
          assetCode: 'USD',
          assetScale: 2,
          value: 550n
        })
        expect(completedOutgoingPayment.sentAmount).toMatchObject({
          assetCode: 'USD',
          assetScale: 2,
          value: 550n
        })

        const incomingPaymentId = receiver.id.split('/').slice(-1)[0]
        const incomingPayment = await getIncomingPayment(incomingPaymentId)
        expect(incomingPayment.receivedAmount).toMatchObject({
          assetCode: 'EUR',
          assetScale: 2,
          value: 500n
        })
        expect(incomingPayment.state).toBe(IncomingPaymentState.Completed)
      })

      test('Peer to Peer - Multiple Outgoing Payments into Incoming Payment', async (): Promise<void> => {
        const {
          createReceiver,
          createOutgoingPaymentFromIncomingPayment,
          getIncomingPayment
        } = testActions.admin

        const senderWalletAddress = await c9.accounts.getByWalletAddressUrl(
          'https://cloud-nine-wallet-test-backend:3100/accounts/gfranklin'
        )
        assert(senderWalletAddress?.walletAddressID)

        const senderWalletAddressId = senderWalletAddress.walletAddressID
        const createReceiverInput = {
          metadata: {
            description: 'For lunch!'
          },
          walletAddressUrl:
            'https://cloud-nine-wallet-test-backend:3100/accounts/bhamchest'
        }

        const value = '500'
        const receiver = await createReceiver(createReceiverInput)

        await createOutgoingPaymentFromIncomingPayment({
          incomingPayment: receiver.id,
          walletAddressId: senderWalletAddressId,
          debitAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: value as unknown as bigint
          }
        })
        await createOutgoingPaymentFromIncomingPayment({
          incomingPayment: receiver.id,
          walletAddressId: senderWalletAddressId,
          debitAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: value as unknown as bigint
          }
        })

        const incomingPaymentId = receiver.id.split('/').slice(-1)[0]
        const incomingPayment = await getIncomingPayment(incomingPaymentId)
        expect(incomingPayment.receivedAmount.value).toBe(BigInt(value) * 2n)
        expect(incomingPayment.state).toBe(IncomingPaymentState.Processing)
      })
    })
  })
})
