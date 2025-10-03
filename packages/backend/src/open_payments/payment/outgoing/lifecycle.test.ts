// mock outgoing payment, lifecycle, grant etc. as needed
// do setup for creating an outgoing payment (wallet address, incoming payment, grant, etc.)
// - need to simulate (or actually do?) the outgoing payment fund. probably just update the state (SENDING)?
// call the "worker" manually
// - basically just the outgoingPayment.processNext?
// verify grant spent amounts are correct

// questions
// - what about accounting stuff? any problems/mocking required there?

// factors:
// - failed or partial payment
// - with or without interval
//   - if with interval, if in or out of interval
// cases:
// Full payment (no adjustments)
// Failed payment, no interval, new amt correct
// Failed payment, interval (inside), new amt correct
// Failed payment, interval (outside), new amt correct
// Partial payment, no interval, new amt correct
// Partial payment, interval (inside), new amt correct
// Partial payment, interval (outside), new amt correct

import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../../app'
import { Config } from '../../../config/app'
import { createTestApp, TestContainer } from '../../../tests/app'
import { initIocContainer } from '../../..'
import { createAsset } from '../../../tests/asset'
import { createWalletAddress } from '../../../tests/walletAddress'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { truncateTables } from '../../../tests/tableManager'
import { uuid } from '../../../payment-method/ilp/connector/ilp-routing/lib/utils'
import { Grant } from '../../auth/middleware'
import { Knex } from 'knex'
import { Asset } from '../../../asset/model'
import {
  OutgoingPayment,
  OutgoingPaymentGrant,
  OutgoingPaymentGrantSpentAmounts,
  OutgoingPaymentState
} from './model'
import { createQuote } from '../../../tests/quote'
import { AccountingService } from '../../../accounting/service'
import { OutgoingPaymentService } from './service'
import assert from 'assert'
import { isOutgoingPaymentError } from './errors'
import { PaymentMethodHandlerService } from '../../../payment-method/handler/service'
import { IncomingPayment } from '../incoming/model'
import { Fee } from '../../../fee/model'
import { PaymentMethodHandlerError } from '../../../payment-method/handler/errors'

describe('Lifecycle', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let outgoingPaymentService: OutgoingPaymentService
  let accountingService: AccountingService
  let paymentMethodHandlerService: PaymentMethodHandlerService
  let knex: Knex
  let walletAddressId: string
  let receiverWalletAddressId: string
  let receiver: string
  let incomingPayment: IncomingPayment
  let asset: Asset

  const assetDetails = {
    scale: 2,
    code: 'USD'
  }

  async function createAndFundGrantPayment(
    debitAmountValue: bigint,
    grant: Grant,
    mockPayFactory?: (
      accountingService: AccountingService,
      receiverWalletAddressId: string,
      payment: OutgoingPayment
    ) => jest.Mock
  ) {
    await OutgoingPaymentGrant.query(knex)
      .insert({
        id: grant.id
      })
      .onConflict('id')
      .ignore()

    const quote = await createQuote(deps, {
      walletAddressId,
      receiver,
      debitAmount: {
        value: debitAmountValue,
        assetCode: asset.code,
        assetScale: asset.scale
      },
      method: 'ilp',
      exchangeRate: 1
    })

    const payment = await outgoingPaymentService.create({
      walletAddressId,
      quoteId: quote.id,
      grant
    })
    assert.ok(!isOutgoingPaymentError(payment))

    const fundResult = await outgoingPaymentService.fund({
      id: payment.id,
      amount: payment.debitAmount.value,
      transferId: uuid()
    })
    assert.ok(fundResult instanceof OutgoingPayment)
    expect(fundResult.state).toBe(OutgoingPaymentState.Sending)

    if (mockPayFactory) {
      const mockPay = mockPayFactory(
        accountingService,
        receiverWalletAddressId,
        payment
      )
      jest
        .spyOn(paymentMethodHandlerService, 'pay')
        .mockImplementationOnce(mockPay)
    }

    return payment
  }

  function mockPaySuccessFactory() {
    return (
      accountingService: AccountingService,
      receiverWalletAddressId: string,
      payment: OutgoingPayment
    ) =>
      jest.fn(async (_: any, args: any) => {
        const amount = args.finalDebitAmount
        const transfer = await accountingService.createTransfer({
          sourceAccount: payment,
          destinationAccount: await createIncomingPayment(deps, {
            walletAddressId: receiverWalletAddressId
          }),
          sourceAmount: amount,
          destinationAmount: amount,
          timeout: 0
        })
        assert.ok(transfer && typeof transfer === 'object')
        await transfer.post()
        return amount
      })
  }

  function mockPayPartialFactory(partial: { debit: bigint; receive: bigint }) {
    return (
      accountingService: AccountingService,
      receiverWalletAddressId: string,
      payment: OutgoingPayment
    ) =>
      jest.fn(async () => {
        const transfer = await accountingService.createTransfer({
          sourceAccount: payment,
          destinationAccount: await createIncomingPayment(deps, {
            walletAddressId: receiverWalletAddressId
          }),
          sourceAmount: partial.debit,
          destinationAmount: partial.receive,
          timeout: 0
        })
        assert.ok(transfer && typeof transfer === 'object')
        await transfer.post()
        return partial.receive
      })
  }

  function mockPayErrorFactory() {
    return () =>
      jest.fn(async () => {
        throw new PaymentMethodHandlerError('Simulated failure', {
          description: 'Payment failed',
          retryable: false
        })
      })
  }

  describe('Grant Spent Amounts', (): void => {
    beforeAll(async (): Promise<void> => {
      deps = initIocContainer(Config)
      appContainer = await createTestApp(deps)
      outgoingPaymentService = await deps.use('outgoingPaymentService')
      accountingService = await deps.use('accountingService')
      paymentMethodHandlerService = await deps.use(
        'paymentMethodHandlerService'
      )
      knex = appContainer.knex
    })

    beforeEach(async (): Promise<void> => {
      // Create sender wallet address
      asset = await createAsset(deps, assetDetails)
      const senderWalletAddress = await createWalletAddress(deps, {
        assetId: asset.id
      })
      walletAddressId = senderWalletAddress.id

      // Create receiver wallet address and incoming payment
      const receiverWalletAddress = await createWalletAddress(deps, {
        assetId: asset.id
      })
      receiverWalletAddressId = receiverWalletAddress.id

      incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: receiverWalletAddressId
      })
      const config = await deps.use('config')
      receiver = incomingPayment.getUrl(config.openPaymentsUrl)
    })

    afterEach(async (): Promise<void> => {
      jest.restoreAllMocks()
      await truncateTables(knex)
    })

    afterAll(async (): Promise<void> => {
      await appContainer.shutdown()
    })

    describe('Initial Payment', (): void => {
      test('Successful full payment should not change grant spent amounts', async (): Promise<void> => {
        const grant: Grant = {
          id: uuid(),
          limits: {
            debitAmount: {
              value: 1000n,
              assetCode: asset.code,
              assetScale: asset.scale
            }
          }
        }
        const paymentAmount = 100n

        const payment = await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPaySuccessFactory()
        )

        const startSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .first()

        // Initital spent amount records should reflect outgoing payment amounts
        expect(startSpentAmounts).toMatchObject({
          grantId: grant.id,
          outgoingPaymentId: payment.id,
          receiveAmountScale: assetDetails.scale,
          receiveAmountCode: assetDetails.code,
          paymentReceiveAmountValue: paymentAmount,
          intervalReceiveAmountValue: null,
          grantTotalReceiveAmountValue: paymentAmount,
          debitAmountScale: assetDetails.scale,
          debitAmountCode: assetDetails.code,
          paymentDebitAmountValue: paymentAmount,
          intervalDebitAmountValue: null,
          grantTotalDebitAmountValue: paymentAmount,
          paymentState: OutgoingPaymentState.Funding,
          intervalStart: null,
          intervalEnd: null
        })

        const processedPaymentId = await outgoingPaymentService.processNext()
        expect(processedPaymentId).toBe(payment.id)

        const finalPayment = await outgoingPaymentService.get({
          id: payment.id
        })
        expect(finalPayment?.state).toBe(OutgoingPaymentState.Completed)

        // There should not be a new spent amounts record
        const endSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .orderBy('createdAt', 'desc')
          .first()
        assert(endSpentAmounts)
        expect(endSpentAmounts).toEqual(startSpentAmounts)
      })

      test('Partial payment should add new, settled grant payment amount', async (): Promise<void> => {
        const grant: Grant = {
          id: uuid(),
          limits: {
            debitAmount: {
              value: 1000n,
              assetCode: asset.code,
              assetScale: asset.scale
            }
          }
        }
        const paymentAmount = 100n
        const settledAmount = 75n

        const payment = await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPayPartialFactory({
            debit: settledAmount,
            receive: settledAmount
          })
        )

        const startSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .first()

        assert(startSpentAmounts)
        // Initital spent amount records should reflect outgoing payment amounts
        expect(startSpentAmounts).toMatchObject({
          grantId: grant.id,
          outgoingPaymentId: payment.id,
          receiveAmountScale: assetDetails.scale,
          receiveAmountCode: assetDetails.code,
          paymentReceiveAmountValue: 100n,
          intervalReceiveAmountValue: null,
          grantTotalReceiveAmountValue: 100n,
          debitAmountScale: assetDetails.scale,
          debitAmountCode: assetDetails.code,
          paymentDebitAmountValue: paymentAmount,
          intervalDebitAmountValue: null,
          grantTotalDebitAmountValue: paymentAmount,
          paymentState: OutgoingPaymentState.Funding,
          intervalStart: null,
          intervalEnd: null
        })

        const processedPaymentId = await outgoingPaymentService.processNext()
        expect(processedPaymentId).toBe(payment.id)

        const finalPayment = await outgoingPaymentService.get({
          id: payment.id
        })
        expect(finalPayment?.state).toBe(OutgoingPaymentState.Completed)

        const endSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .orderBy('createdAt', 'desc')
          .first()

        assert(endSpentAmounts)

        // expect new spent amount record with the settled amounts
        expect(endSpentAmounts.id).not.toBe(startSpentAmounts.id)
        expect(endSpentAmounts).toMatchObject({
          grantId: grant.id,
          outgoingPaymentId: payment.id,
          receiveAmountScale: assetDetails.scale,
          receiveAmountCode: assetDetails.code,
          paymentReceiveAmountValue: settledAmount,
          intervalReceiveAmountValue: null,
          grantTotalReceiveAmountValue: settledAmount,
          debitAmountScale: assetDetails.scale,
          debitAmountCode: assetDetails.code,
          paymentDebitAmountValue: settledAmount,
          intervalDebitAmountValue: null,
          grantTotalDebitAmountValue: settledAmount,
          paymentState: OutgoingPaymentState.Funding,
          intervalStart: null,
          intervalEnd: null
        })
      })

      test('Failed payment should remove latest amount', async (): Promise<void> => {
        const grant: Grant = {
          id: uuid(),
          limits: {
            debitAmount: {
              value: 1000n,
              assetCode: asset.code,
              assetScale: asset.scale
            }
          }
        }
        const paymentAmount = 100n
        const payment = await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPayErrorFactory()
        )
        const startSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .first()

        // Initital spent amount records should reflect outgoing payment amounts
        expect(startSpentAmounts).toMatchObject({
          grantId: grant.id,
          outgoingPaymentId: payment.id,
          receiveAmountScale: assetDetails.scale,
          receiveAmountCode: assetDetails.code,
          paymentReceiveAmountValue: 100n,
          intervalReceiveAmountValue: null,
          grantTotalReceiveAmountValue: 100n,
          debitAmountScale: assetDetails.scale,
          debitAmountCode: assetDetails.code,
          paymentDebitAmountValue: paymentAmount,
          intervalDebitAmountValue: null,
          grantTotalDebitAmountValue: paymentAmount,
          paymentState: OutgoingPaymentState.Funding,
          intervalStart: null,
          intervalEnd: null
        })

        const processedPaymentId = await outgoingPaymentService.processNext()
        expect(processedPaymentId).toBe(payment.id)

        const endSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .orderBy('createdAt', 'desc')
          .first()

        expect(endSpentAmounts).toBe(undefined)
      })
    })

    describe('Successive Payment', (): void => {
      test('Successful full payment should not change grant spent amounts', async (): Promise<void> => {
        const grant: Grant = {
          id: uuid(),
          limits: {
            debitAmount: {
              value: 1000n,
              assetCode: asset.code,
              assetScale: asset.scale
            }
          }
        }
        const paymentAmount = 100n

        // Create and process first payment
        await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPaySuccessFactory()
        )
        await outgoingPaymentService.processNext()

        // Create second payment
        const secondPayment = await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPaySuccessFactory()
        )

        const startSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: secondPayment.id })
          .first()

        // Initital spent amount records should reflect outgoing payment amounts
        expect(startSpentAmounts).toMatchObject({
          grantId: grant.id,
          outgoingPaymentId: secondPayment.id,
          receiveAmountScale: assetDetails.scale,
          receiveAmountCode: assetDetails.code,
          paymentReceiveAmountValue: paymentAmount,
          intervalReceiveAmountValue: null,
          grantTotalReceiveAmountValue: paymentAmount * 2n,
          debitAmountScale: assetDetails.scale,
          debitAmountCode: assetDetails.code,
          paymentDebitAmountValue: paymentAmount,
          intervalDebitAmountValue: null,
          grantTotalDebitAmountValue: paymentAmount * 2n,
          paymentState: OutgoingPaymentState.Funding,
          intervalStart: null,
          intervalEnd: null
        })

        const processedPaymentId = await outgoingPaymentService.processNext()
        expect(processedPaymentId).toBe(secondPayment.id)

        const finalPayment = await outgoingPaymentService.get({
          id: secondPayment.id
        })
        expect(finalPayment?.state).toBe(OutgoingPaymentState.Completed)

        // There should not be a new spent amounts record from the worker
        const endSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: secondPayment.id })
          .orderBy('createdAt', 'desc')
          .first()
        assert(endSpentAmounts)
        expect(endSpentAmounts).toEqual(startSpentAmounts)
      })

      test.only('Partial payment should add new, settled grant payment amount', async (): Promise<void> => {
        const grant: Grant = {
          id: uuid(),
          limits: {
            debitAmount: {
              value: 1000n,
              assetCode: asset.code,
              assetScale: asset.scale
            }
          }
        }

        // Create and process full payment
        const paymentAmount = 100n
        await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPaySuccessFactory()
        )
        await outgoingPaymentService.processNext()

        // Create second payment with partially settled amount
        const secondPaymentSettledAmount = 75n
        const secondPayment = await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPayPartialFactory({
            debit: secondPaymentSettledAmount,
            receive: secondPaymentSettledAmount
          })
        )

        const startSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: secondPayment.id })
          .first()

        assert(startSpentAmounts)
        // Initital spent amount records should reflect full outgoing payment amounts
        expect(startSpentAmounts).toMatchObject({
          grantId: grant.id,
          outgoingPaymentId: secondPayment.id,
          receiveAmountScale: assetDetails.scale,
          receiveAmountCode: assetDetails.code,
          paymentReceiveAmountValue: paymentAmount,
          intervalReceiveAmountValue: null,
          grantTotalReceiveAmountValue: paymentAmount * 2n,
          debitAmountScale: assetDetails.scale,
          debitAmountCode: assetDetails.code,
          paymentDebitAmountValue: paymentAmount,
          intervalDebitAmountValue: null,
          grantTotalDebitAmountValue: paymentAmount * 2n,
          paymentState: OutgoingPaymentState.Funding,
          intervalStart: null,
          intervalEnd: null
        })

        const processedPaymentId = await outgoingPaymentService.processNext()
        expect(processedPaymentId).toBe(secondPayment.id)

        const finalPayment = await outgoingPaymentService.get({
          id: secondPayment.id
        })
        expect(finalPayment?.state).toBe(OutgoingPaymentState.Completed)

        const endSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: secondPayment.id })
          .orderBy('createdAt', 'desc')
          .first()

        assert(endSpentAmounts)

        console.log({ endSpentAmounts })

        // There should be a new spent amounts record from the worker with the settled amounts
        expect(endSpentAmounts.id).not.toBe(startSpentAmounts.id)
        expect(endSpentAmounts).toMatchObject({
          grantId: grant.id,
          outgoingPaymentId: secondPayment.id,
          receiveAmountScale: assetDetails.scale,
          receiveAmountCode: assetDetails.code,
          paymentReceiveAmountValue: secondPaymentSettledAmount,
          intervalReceiveAmountValue: null,
          grantTotalReceiveAmountValue:
            paymentAmount + secondPaymentSettledAmount,
          debitAmountScale: assetDetails.scale,
          debitAmountCode: assetDetails.code,
          paymentDebitAmountValue: secondPaymentSettledAmount,
          intervalDebitAmountValue: null,
          grantTotalDebitAmountValue:
            paymentAmount + secondPaymentSettledAmount,
          paymentState: OutgoingPaymentState.Funding,
          intervalStart: null,
          intervalEnd: null
        })
      })
    })
  })
})
