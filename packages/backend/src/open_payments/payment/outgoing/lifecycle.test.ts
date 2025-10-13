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
import { AccountingService, Transaction } from '../../../accounting/service'
import { OutgoingPaymentService } from './service'
import assert from 'assert'
import { isOutgoingPaymentError } from './errors'
import { PaymentMethodHandlerService } from '../../../payment-method/handler/service'
import { IncomingPayment } from '../incoming/model'
import { PaymentMethodHandlerError } from '../../../payment-method/handler/errors'
import { getInterval } from './limits'
import { TransferError } from '../../../accounting/errors'

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
      jest.fn(async (_: unknown, args: { finalDebitAmount: bigint }) => {
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
        return { debit: amount, receive: amount }
      })
  }

  function mockPayPartialFactory(partial: { debit: bigint; receive: bigint }) {
    return (
      accountingService: AccountingService,
      receiverWalletAddressId: string,
      payment: OutgoingPayment
    ) =>
      jest.fn(async () => {
        const transfer: Transaction | TransferError =
          await accountingService.createTransfer({
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
        return { debit: partial.debit, receive: partial.receive }
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

      jest.useFakeTimers()
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
      jest.useRealTimers()
      await appContainer.shutdown()
    })

    describe('No Interval', (): void => {
      test('Successful full payment should have null interval fields', async (): Promise<void> => {
        jest.setSystemTime(new Date('2025-01-02T00:00:00Z'))

        const grant = {
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

        assert(startSpentAmounts)

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

        // advance time to ensure spents amounts created by processNext, if any, have
        // later createdAt so that fetching latest is accurate
        jest.advanceTimersByTime(500)
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
    })
    describe('Inter-Interval', (): void => {
      describe('Initial Payment', (): void => {
        test('Successful full payment should not change grant spent amounts', async (): Promise<void> => {
          jest.setSystemTime(new Date('2025-01-02T00:00:00Z'))
          const grant = {
            id: uuid(),
            limits: {
              debitAmount: {
                value: 1000n,
                assetCode: asset.code,
                assetScale: asset.scale
              },
              interval: 'R/2025-01-01T00:00:00Z/P1M'
            }
          }
          const paymentAmount = 100n

          const payment = await createAndFundGrantPayment(
            paymentAmount,
            grant,
            mockPaySuccessFactory()
          )

          const startSpentAmounts =
            await OutgoingPaymentGrantSpentAmounts.query(knex)
              .where({ outgoingPaymentId: payment.id })
              .first()

          // Initital spent amount records should reflect outgoing payment amounts
          const interval = getInterval(grant.limits.interval, new Date())
          assert(interval)
          assert(interval.start)
          assert(interval.end)
          expect(startSpentAmounts).toMatchObject({
            grantId: grant.id,
            outgoingPaymentId: payment.id,
            receiveAmountScale: assetDetails.scale,
            receiveAmountCode: assetDetails.code,
            paymentReceiveAmountValue: paymentAmount,
            intervalReceiveAmountValue: 100n,
            grantTotalReceiveAmountValue: paymentAmount,
            debitAmountScale: assetDetails.scale,
            debitAmountCode: assetDetails.code,
            paymentDebitAmountValue: paymentAmount,
            intervalDebitAmountValue: 100n,
            grantTotalDebitAmountValue: paymentAmount,
            paymentState: OutgoingPaymentState.Funding,
            intervalStart: interval.start.toJSDate(),
            intervalEnd: interval.end.toJSDate()
          })

          // advance time to ensure spents amounts created by processNext, if any, have
          // later createdAt so that fetching latest is accurate
          jest.advanceTimersByTime(500)
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
          jest.setSystemTime(new Date('2025-01-02T00:00:00Z'))
          const grant = {
            id: uuid(),
            limits: {
              debitAmount: {
                value: 1000n,
                assetCode: asset.code,
                assetScale: asset.scale
              },
              interval: 'R/2025-01-01T00:00:00Z/P1M'
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

          const startSpentAmounts =
            await OutgoingPaymentGrantSpentAmounts.query(knex)
              .where({ outgoingPaymentId: payment.id })
              .first()
          assert(startSpentAmounts)

          // Initital spent amount records should reflect full outgoing payment amounts
          const interval = getInterval(grant.limits.interval, new Date())
          assert(interval)
          assert(interval.start)
          assert(interval.end)
          expect(startSpentAmounts).toMatchObject({
            grantId: grant.id,
            outgoingPaymentId: payment.id,
            receiveAmountScale: assetDetails.scale,
            receiveAmountCode: assetDetails.code,
            paymentReceiveAmountValue: 100n,
            intervalReceiveAmountValue: paymentAmount,
            grantTotalReceiveAmountValue: 100n,
            debitAmountScale: assetDetails.scale,
            debitAmountCode: assetDetails.code,
            paymentDebitAmountValue: paymentAmount,
            intervalDebitAmountValue: paymentAmount,
            grantTotalDebitAmountValue: paymentAmount,
            paymentState: OutgoingPaymentState.Funding,
            intervalStart: interval.start.toJSDate(),
            intervalEnd: interval.end.toJSDate()
          })

          // advance time to ensure spents amounts created by processNext, if any, have
          // later createdAt so that fetching latest is accurate
          jest.advanceTimersByTime(500)
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
            intervalReceiveAmountValue: settledAmount,
            grantTotalReceiveAmountValue: settledAmount,
            debitAmountScale: assetDetails.scale,
            debitAmountCode: assetDetails.code,
            paymentDebitAmountValue: settledAmount,
            intervalDebitAmountValue: settledAmount,
            grantTotalDebitAmountValue: settledAmount,
            paymentState: OutgoingPaymentState.Funding,
            intervalStart: interval.start.toJSDate(),
            intervalEnd: interval.end.toJSDate()
          })
        })

        test('Failed payment should remove latest amount', async (): Promise<void> => {
          jest.setSystemTime(new Date('2025-01-02T00:00:00Z'))
          const grant = {
            id: uuid(),
            limits: {
              debitAmount: {
                value: 1000n,
                assetCode: asset.code,
                assetScale: asset.scale
              },
              interval: 'R/2025-01-01T00:00:00Z/P1M'
            }
          }
          const paymentAmount = 100n
          const payment = await createAndFundGrantPayment(
            paymentAmount,
            grant,
            mockPayErrorFactory()
          )
          const startSpentAmounts =
            await OutgoingPaymentGrantSpentAmounts.query(knex)
              .where({ outgoingPaymentId: payment.id })
              .first()

          // Initital spent amount records should reflect outgoing payment amounts
          const interval = getInterval(grant.limits.interval, new Date())
          assert(interval)
          assert(interval.start)
          assert(interval.end)
          expect(startSpentAmounts).toMatchObject({
            grantId: grant.id,
            outgoingPaymentId: payment.id,
            receiveAmountScale: assetDetails.scale,
            receiveAmountCode: assetDetails.code,
            paymentReceiveAmountValue: 100n,
            intervalReceiveAmountValue: paymentAmount,
            grantTotalReceiveAmountValue: 100n,
            debitAmountScale: assetDetails.scale,
            debitAmountCode: assetDetails.code,
            paymentDebitAmountValue: paymentAmount,
            intervalDebitAmountValue: paymentAmount,
            grantTotalDebitAmountValue: paymentAmount,
            paymentState: OutgoingPaymentState.Funding,
            intervalStart: interval.start.toJSDate(),
            intervalEnd: interval.end.toJSDate()
          })

          // advance time to ensure spents amounts created by processNext, if any, have
          // later createdAt so that fetching latest is accurate
          jest.advanceTimersByTime(500)
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
          jest.setSystemTime(new Date('2025-01-02T00:00:00Z'))
          const grant = {
            id: uuid(),
            limits: {
              debitAmount: {
                value: 1000n,
                assetCode: asset.code,
                assetScale: asset.scale
              },
              interval: 'R/2025-01-01T00:00:00Z/P1M'
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

          const startSpentAmounts =
            await OutgoingPaymentGrantSpentAmounts.query(knex)
              .where({ outgoingPaymentId: secondPayment.id })
              .first()

          // Initital spent amount records should reflect full outgoing payment amounts
          const interval = getInterval(grant.limits.interval, new Date())
          assert(interval)
          assert(interval.start)
          assert(interval.end)
          expect(startSpentAmounts).toMatchObject({
            grantId: grant.id,
            outgoingPaymentId: secondPayment.id,
            receiveAmountScale: assetDetails.scale,
            receiveAmountCode: assetDetails.code,
            paymentReceiveAmountValue: paymentAmount,
            intervalReceiveAmountValue: paymentAmount * 2n,
            grantTotalReceiveAmountValue: paymentAmount * 2n,
            debitAmountScale: assetDetails.scale,
            debitAmountCode: assetDetails.code,
            paymentDebitAmountValue: paymentAmount,
            intervalDebitAmountValue: paymentAmount * 2n,
            grantTotalDebitAmountValue: paymentAmount * 2n,
            paymentState: OutgoingPaymentState.Funding,
            intervalStart: interval.start.toJSDate(),
            intervalEnd: interval.end.toJSDate()
          })

          // advance time to ensure spents amounts created by processNext, if any, have
          // later createdAt so that fetching latest is accurate
          jest.advanceTimersByTime(500)
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

        test('Partial payment should add new, settled grant payment amount', async (): Promise<void> => {
          jest.setSystemTime(new Date('2025-01-02T00:00:00Z'))
          const grant = {
            id: uuid(),
            limits: {
              debitAmount: {
                value: 1000n,
                assetCode: asset.code,
                assetScale: asset.scale
              },
              interval: 'R/2025-01-01T00:00:00Z/P1M'
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

          // advance time to ensure spents amounts created by outgoing payment create
          // has later createdAt so that fetching latest is accurate
          jest.advanceTimersByTime(500)

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

          const startSpentAmounts =
            await OutgoingPaymentGrantSpentAmounts.query(knex)
              .where({ outgoingPaymentId: secondPayment.id })
              .first()

          assert(startSpentAmounts)
          // Initital spent amount records should reflect full outgoing payment amounts
          const interval = getInterval(grant.limits.interval, new Date())
          assert(interval)
          assert(interval.start)
          assert(interval.end)
          expect(startSpentAmounts).toMatchObject({
            grantId: grant.id,
            outgoingPaymentId: secondPayment.id,
            receiveAmountScale: assetDetails.scale,
            receiveAmountCode: assetDetails.code,
            paymentReceiveAmountValue: paymentAmount,
            intervalReceiveAmountValue: paymentAmount * 2n,
            grantTotalReceiveAmountValue: paymentAmount * 2n,
            debitAmountScale: assetDetails.scale,
            debitAmountCode: assetDetails.code,
            paymentDebitAmountValue: paymentAmount,
            intervalDebitAmountValue: paymentAmount * 2n,
            grantTotalDebitAmountValue: paymentAmount * 2n,
            paymentState: OutgoingPaymentState.Funding,
            intervalStart: interval.start.toJSDate(),
            intervalEnd: interval.end.toJSDate()
          })

          // advance time to ensure spents amounts created by processNext, if any, have
          // later createdAt so that fetching latest is accurate
          jest.advanceTimersByTime(500)
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

          // There should be a new spent amounts record from the worker with the settled amounts
          expect(endSpentAmounts.id).not.toBe(startSpentAmounts.id)
          expect(endSpentAmounts).toMatchObject({
            grantId: grant.id,
            outgoingPaymentId: secondPayment.id,
            receiveAmountScale: assetDetails.scale,
            receiveAmountCode: assetDetails.code,
            paymentReceiveAmountValue: secondPaymentSettledAmount,
            intervalReceiveAmountValue:
              paymentAmount + secondPaymentSettledAmount,
            grantTotalReceiveAmountValue:
              paymentAmount + secondPaymentSettledAmount,
            debitAmountScale: assetDetails.scale,
            debitAmountCode: assetDetails.code,
            paymentDebitAmountValue: secondPaymentSettledAmount,
            intervalDebitAmountValue:
              paymentAmount + secondPaymentSettledAmount,
            grantTotalDebitAmountValue:
              paymentAmount + secondPaymentSettledAmount,
            paymentState: OutgoingPaymentState.Funding,
            intervalStart: interval.start.toJSDate(),
            intervalEnd: interval.end.toJSDate()
          })
        })

        test('Failed payment should remove latest amount', async (): Promise<void> => {
          jest.setSystemTime(new Date('2025-01-02T00:00:00Z'))
          const grant = {
            id: uuid(),
            limits: {
              debitAmount: {
                value: 1000n,
                assetCode: asset.code,
                assetScale: asset.scale
              },
              interval: 'R/2025-01-01T00:00:00Z/P1M'
            }
          }
          const paymentAmount = 100n

          // Create and process first successful payment
          const firstPayment = await createAndFundGrantPayment(
            paymentAmount,
            grant,
            mockPaySuccessFactory()
          )
          await outgoingPaymentService.processNext()

          // advance time to ensure spents amounts created by outgoing payment create
          // has later createdAt so that fetching latest is accurate
          jest.advanceTimersByTime(500)

          // Create second payment which will fail
          const secondPayment = await createAndFundGrantPayment(
            paymentAmount,
            grant,
            mockPayErrorFactory()
          )

          const startSpentAmounts =
            await OutgoingPaymentGrantSpentAmounts.query(knex)
              .where({ outgoingPaymentId: secondPayment.id })
              .first()

          const interval = getInterval(grant.limits.interval, new Date())
          assert(interval)
          assert(interval.start)
          assert(interval.end)
          expect(startSpentAmounts).toMatchObject({
            grantId: grant.id,
            outgoingPaymentId: secondPayment.id,
            receiveAmountScale: assetDetails.scale,
            receiveAmountCode: assetDetails.code,
            paymentReceiveAmountValue: paymentAmount,
            intervalReceiveAmountValue: paymentAmount * 2n,
            grantTotalReceiveAmountValue: paymentAmount * 2n,
            debitAmountScale: assetDetails.scale,
            debitAmountCode: assetDetails.code,
            paymentDebitAmountValue: paymentAmount,
            intervalDebitAmountValue: paymentAmount * 2n,
            grantTotalDebitAmountValue: paymentAmount * 2n,
            paymentState: OutgoingPaymentState.Funding,
            intervalStart: interval.start.toJSDate(),
            intervalEnd: interval.end.toJSDate()
          })

          // advance time to ensure spents amounts created by processNext, if any, have
          // later createdAt so that fetching latest is accurate
          jest.advanceTimersByTime(500)
          const processedPaymentId = await outgoingPaymentService.processNext()
          expect(processedPaymentId).toBe(secondPayment.id)

          const finalPayment = await outgoingPaymentService.get({
            id: secondPayment.id
          })
          expect(finalPayment?.state).toBe(OutgoingPaymentState.Failed)

          // Grant spent amounts for failed payment should be removed
          const endSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
            knex
          )
            .where({ outgoingPaymentId: secondPayment.id })
            .first()
          expect(endSpentAmounts).toBe(undefined)

          const latestSpentAmounts =
            await OutgoingPaymentGrantSpentAmounts.query(knex)
              .where({ grantId: grant.id })
              .orderBy('createdAt', 'desc')
              .first()

          assert(latestSpentAmounts)
          expect(latestSpentAmounts.outgoingPaymentId).toBe(firstPayment.id)
        })

        test('Gets correct spent amounts when multiple outgoing payments are created', async (): Promise<void> => {
          jest.setSystemTime(new Date('2025-01-02T00:00:00Z'))
          const grant = {
            id: uuid(),
            limits: {
              debitAmount: {
                value: 1000n,
                assetCode: asset.code,
                assetScale: asset.scale
              },
              interval: 'R/2025-01-01T00:00:00Z/P1M'
            }
          }

          // Create 2 payments, which create 2 grant spent amounts. Do not process 1st before creating 2nd.
          const firstPayment = await createAndFundGrantPayment(
            100n,
            grant,
            mockPaySuccessFactory()
          )
          jest.advanceTimersByTime(500)

          await createAndFundGrantPayment(200n, grant, mockPaySuccessFactory())
          jest.advanceTimersByTime(500)
          const spentAmounts =
            await OutgoingPaymentGrantSpentAmounts.query(knex)
          expect(spentAmounts.length).toBe(2)

          // Process next (1st payment)
          const id = await outgoingPaymentService.processNext()
          jest.advanceTimersByTime(500)
          expect(id).toBe(firstPayment.id)

          // Grant spent amounts should correspond to the first payment
          // Should not detect a difference and insert a new spent amount.
          const spentAmountsAfterProcessing =
            await OutgoingPaymentGrantSpentAmounts.query(knex)
          expect(spentAmountsAfterProcessing.length).toBe(2)
        })
      })
    })

    describe('Cross-Interval', (): void => {
      test('Payments across intervals should reset interval amounts but accumulate grant total', async (): Promise<void> => {
        const grant = {
          id: uuid(),
          limits: {
            debitAmount: {
              value: 1000n,
              assetCode: asset.code,
              assetScale: asset.scale
            },
            interval: 'R/2025-01-01T00:00:00Z/P5D'
          }
        }
        const paymentAmount = 100n

        // First interval - 2 payments
        jest.setSystemTime(new Date('2025-01-02T00:00:00Z'))
        await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPaySuccessFactory()
        )
        await outgoingPaymentService.processNext()

        jest.advanceTimersByTime(500)
        const secondPayment = await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPaySuccessFactory()
        )
        await outgoingPaymentService.processNext()

        const secondSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: secondPayment.id })
          .orderBy('createdAt', 'desc')
          .first()

        assert(secondSpentAmounts)
        expect(secondSpentAmounts).toMatchObject({
          paymentReceiveAmountValue: paymentAmount,
          intervalReceiveAmountValue: paymentAmount * 2n,
          grantTotalReceiveAmountValue: paymentAmount * 2n,
          paymentDebitAmountValue: paymentAmount,
          intervalDebitAmountValue: paymentAmount * 2n,
          grantTotalDebitAmountValue: paymentAmount * 2n
        })

        // Second interval - 2 payments
        jest.setSystemTime(new Date('2025-01-08T00:00:00Z'))
        jest.advanceTimersByTime(500)

        await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPaySuccessFactory()
        )
        await outgoingPaymentService.processNext()

        jest.advanceTimersByTime(500)
        const fourthPayment = await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPaySuccessFactory()
        )
        await outgoingPaymentService.processNext()

        const fourthSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: fourthPayment.id })
          .orderBy('createdAt', 'desc')
          .first()

        assert(fourthSpentAmounts)
        const secondInterval = getInterval(grant.limits.interval, new Date())
        assert(secondInterval)
        assert(secondInterval.start)
        assert(secondInterval.end)

        // Interval amounts should only include second interval payments (3rd and 4th)
        // Grant total should include all 4 payments
        expect(fourthSpentAmounts).toMatchObject({
          paymentReceiveAmountValue: paymentAmount,
          intervalReceiveAmountValue: paymentAmount * 2n,
          grantTotalReceiveAmountValue: paymentAmount * 4n,
          paymentDebitAmountValue: paymentAmount,
          intervalDebitAmountValue: paymentAmount * 2n,
          grantTotalDebitAmountValue: paymentAmount * 4n,
          intervalStart: secondInterval.start.toJSDate(),
          intervalEnd: secondInterval.end.toJSDate()
        })

        // Verify the interval boundaries are different between first and second
        const firstInterval = getInterval(
          grant.limits.interval,
          new Date('2025-01-02T00:00:00Z')
        )
        assert(firstInterval)
        assert(firstInterval.start)
        expect(fourthSpentAmounts.intervalStart).not.toEqual(
          firstInterval.start.toJSDate()
        )
      })
      test('Payment created at interval boundary should use creation-time interval', async (): Promise<void> => {
        const grant = {
          id: uuid(),
          limits: {
            debitAmount: {
              value: 1000n,
              assetCode: asset.code,
              assetScale: asset.scale
            },
            interval: 'R/2025-01-01T00:00:00Z/P1M'
          }
        }
        const paymentAmount = 100n

        // Create payment at the very end of January
        jest.setSystemTime(new Date('2025-01-31T23:59:59Z'))
        const payment = await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPaySuccessFactory()
        )

        const creationInterval = getInterval(grant.limits.interval, new Date())
        assert(creationInterval)
        assert(creationInterval.start)
        assert(creationInterval.end)

        const startSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .orderBy('createdAt', 'desc')
          .first()
        assert(startSpentAmounts)

        // Process payment after interval boundary (in February)
        jest.setSystemTime(new Date('2025-02-01T00:00:01Z'))
        const processedPaymentId = await outgoingPaymentService.processNext()
        expect(processedPaymentId).toBe(payment.id)

        const finishSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .orderBy('createdAt', 'desc')
          .first()
        assert(finishSpentAmounts)

        // Should still be original spent amounts in January's interval
        expect(finishSpentAmounts).toMatchObject(startSpentAmounts)
        expect(finishSpentAmounts.intervalStart).toEqual(
          creationInterval.start.toJSDate()
        )
        expect(finishSpentAmounts.intervalEnd).toEqual(
          creationInterval.end.toJSDate()
        )
      })
      test('Partial payment at interval boundary should preserve creation-time interval in new record', async (): Promise<void> => {
        const grant = {
          id: uuid(),
          limits: {
            debitAmount: {
              value: 1000n,
              assetCode: asset.code,
              assetScale: asset.scale
            },
            interval: 'R/2025-01-01T00:00:00Z/P1M'
          }
        }
        const paymentAmount = 100n
        const settledAmount = 75n

        // Create and process first payment fully in January
        jest.setSystemTime(new Date('2025-01-15T12:00:00Z'))
        await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPaySuccessFactory()
        )
        await outgoingPaymentService.processNext()

        // Create second payment at the very end of January
        jest.setSystemTime(new Date('2025-01-31T23:59:59Z'))
        const payment = await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPayPartialFactory({
            debit: settledAmount,
            receive: settledAmount
          })
        )

        const creationInterval = getInterval(grant.limits.interval, new Date())
        assert(creationInterval)
        assert(creationInterval.start)
        assert(creationInterval.end)

        const startSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .first()
        assert(startSpentAmounts)

        // Initial record should have full payment amount in January's interval
        // with cumulative amounts from first payment
        expect(startSpentAmounts).toMatchObject({
          paymentReceiveAmountValue: paymentAmount,
          intervalReceiveAmountValue: paymentAmount * 2n,
          grantTotalReceiveAmountValue: paymentAmount * 2n,
          paymentDebitAmountValue: paymentAmount,
          intervalDebitAmountValue: paymentAmount * 2n,
          grantTotalDebitAmountValue: paymentAmount * 2n,
          intervalStart: creationInterval.start.toJSDate(),
          intervalEnd: creationInterval.end.toJSDate()
        })

        // Process payment after interval boundary (in February)
        jest.setSystemTime(new Date('2025-02-01T00:00:01Z'))
        jest.advanceTimersByTime(500)
        const processedPaymentId = await outgoingPaymentService.processNext()
        expect(processedPaymentId).toBe(payment.id)

        const endSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .orderBy('createdAt', 'desc')
          .first()
        assert(endSpentAmounts)

        // New record should be created with first payment + second payment
        // in initial January interval
        expect(endSpentAmounts.id).not.toBe(startSpentAmounts.id)
        expect(endSpentAmounts).toMatchObject({
          paymentReceiveAmountValue: settledAmount,
          intervalReceiveAmountValue: paymentAmount + settledAmount,
          grantTotalReceiveAmountValue: paymentAmount + settledAmount,
          paymentDebitAmountValue: settledAmount,
          intervalDebitAmountValue: paymentAmount + settledAmount,
          grantTotalDebitAmountValue: paymentAmount + settledAmount,
          intervalStart: creationInterval.start.toJSDate(),
          intervalEnd: creationInterval.end.toJSDate()
        })
        const februaryInterval = getInterval(
          grant.limits.interval,
          new Date('2025-02-01T00:00:01Z')
        )
        assert(februaryInterval)
        assert(februaryInterval.start)
        expect(endSpentAmounts.intervalStart).not.toEqual(
          februaryInterval.start.toJSDate()
        )
      })
      test('Failed payment created in one interval but processed in next should remove spent amounts', async (): Promise<void> => {
        const grant = {
          id: uuid(),
          limits: {
            debitAmount: {
              value: 1000n,
              assetCode: asset.code,
              assetScale: asset.scale
            },
            interval: 'R/2025-01-01T00:00:00Z/P1M'
          }
        }
        const paymentAmount = 100n

        // Create and process first payment fully in January
        jest.setSystemTime(new Date('2025-01-15T12:00:00Z'))
        await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPaySuccessFactory()
        )
        await outgoingPaymentService.processNext()

        const initialSpentAmounts =
          await OutgoingPaymentGrantSpentAmounts.query(knex)
            .where({ grantId: grant.id })
            .orderBy('createdAt', 'desc')
            .first()
        assert(initialSpentAmounts)

        // Create second payment at the very end of January
        jest.setSystemTime(new Date('2025-01-31T23:59:59Z'))
        const payment = await createAndFundGrantPayment(
          paymentAmount,
          grant,
          mockPayErrorFactory()
        )

        const creationInterval = getInterval(grant.limits.interval, new Date())
        assert(creationInterval)
        assert(creationInterval.start)
        assert(creationInterval.end)

        const startSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .first()
        assert(startSpentAmounts)

        // Initial record should have full payment amount in January's interval
        // with cumulative amounts from first payment
        expect(startSpentAmounts).toMatchObject({
          paymentReceiveAmountValue: paymentAmount,
          intervalReceiveAmountValue: paymentAmount * 2n,
          grantTotalReceiveAmountValue: paymentAmount * 2n,
          paymentDebitAmountValue: paymentAmount,
          intervalDebitAmountValue: paymentAmount * 2n,
          grantTotalDebitAmountValue: paymentAmount * 2n,
          intervalStart: creationInterval.start.toJSDate(),
          intervalEnd: creationInterval.end.toJSDate()
        })

        // Process payment after interval boundary (in February)
        jest.setSystemTime(new Date('2025-02-01T00:00:01Z'))
        jest.advanceTimersByTime(500)
        const processedPaymentId = await outgoingPaymentService.processNext()
        expect(processedPaymentId).toBe(payment.id)

        const finalPayment = await outgoingPaymentService.get({
          id: payment.id
        })
        expect(finalPayment?.state).toBe(OutgoingPaymentState.Failed)

        // Grant spent amounts for failed payment should be removed
        const endSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ outgoingPaymentId: payment.id })
          .first()
        expect(endSpentAmounts).toBe(undefined)

        // Only the first successful spent amounts should remain
        const latestSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        )
          .where({ grantId: grant.id })
          .orderBy('createdAt', 'desc')
          .first()

        assert(latestSpentAmounts)
        expect(latestSpentAmounts).toMatchObject(initialSpentAmounts)
      })
    })
  })
})
