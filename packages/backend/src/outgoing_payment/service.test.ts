import assert from 'assert'
import nock from 'nock'
import Knex from 'knex'
import * as Pay from '@interledger/pay'
import { v4 as uuid } from 'uuid'

import { OutgoingPaymentService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { IAppConfig, Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { truncateTable, truncateTables } from '../tests/tableManager'
import { OutgoingPayment, PaymentIntent, PaymentState } from './model'
import { LifecycleError } from './lifecycle'
import { RETRY_BACKOFF_SECONDS } from './worker'
import { isTransferError } from '../accounting/errors'
import {
  AssetAccount,
  AccountingService,
  SendReceiveOptions
} from '../accounting/service'
import { AssetOptions } from '../asset/service'
import { Invoice } from '../open_payments/invoice/model'
import { RatesService } from '../rates/service'

describe('OutgoingPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let outgoingPaymentService: OutgoingPaymentService
  let ratesService: RatesService
  let accountingService: AccountingService
  let knex: Knex
  let accountId: string
  let asset: AssetOptions
  let invoice: Invoice
  let invoiceUrl: string
  let accountUrl: string
  let paymentPointer: string
  let amtDelivered: bigint
  let config: IAppConfig

  async function processNext(
    paymentId: string,
    expectState?: PaymentState,
    expectedError?: string
  ): Promise<OutgoingPayment> {
    await expect(outgoingPaymentService.processNext()).resolves.toBe(paymentId)
    const payment = await outgoingPaymentService.get(paymentId)
    if (!payment) throw 'no payment'
    if (expectState) expect(payment.state).toBe(expectState)
    expect(payment.error).toEqual(expectedError || null)
    return payment
  }

  function mockPay(
    extendQuote: Partial<Pay.Quote>,
    error?: Pay.PaymentError
  ): jest.SpyInstance<Promise<Pay.PaymentProgress>, [options: Pay.PayOptions]> {
    const { pay } = Pay
    return jest
      .spyOn(Pay, 'pay')
      .mockImplementation(async (opts: Pay.PayOptions) => {
        const res = await pay({
          ...opts,
          quote: { ...opts.quote, ...extendQuote }
        })
        if (error) res.error = error
        return res
      })
  }

  // Mock the time to fast-forward to the time that the specified (absolute, not relative) attempt is scheduled.
  function fastForwardToAttempt(stateAttempts: number): void {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(
        Date.now() + stateAttempts * RETRY_BACKOFF_SECONDS * 1000
      )
  }

  async function payInvoice(amount: bigint): Promise<void> {
    const trxOrError = await accountingService.sendAndReceive({
      sourceAccount: {
        asset: {
          unit: invoice.account.asset.unit,
          account: AssetAccount.Settlement
        }
      },
      destinationAccount: {
        id: invoice.id,
        asset: invoice.account.asset
      },
      sourceAmount: amount,
      timeout: BigInt(10e9) // 10 seconds
    })
    assert.ok(!isTransferError(trxOrError))
    await expect(trxOrError.commit()).resolves.toBeUndefined()
  }

  function trackAmountDelivered(sourceAccountId: string): void {
    const { sendAndReceive } = accountingService
    jest
      .spyOn(accountingService, 'sendAndReceive')
      .mockImplementation(async (options: SendReceiveOptions) => {
        const trxOrError = await sendAndReceive(options)
        if (
          !isTransferError(trxOrError) &&
          options.sourceAccount.sentAccountId === sourceAccountId
        ) {
          amtDelivered += options.destinationAmount || options.sourceAmount
        }
        return trxOrError
      })
  }

  async function expectOutcome(
    payment: OutgoingPayment,
    {
      amountSent,
      amountDelivered,
      invoiceReceived
    }: {
      amountSent?: bigint
      amountDelivered?: bigint
      invoiceReceived?: bigint
    }
  ) {
    if (amountSent !== undefined) {
      await expect(accountingService.getTotalSent(payment.id)).resolves.toBe(
        amountSent
      )
    }
    if (amountDelivered !== undefined) {
      expect(amtDelivered).toEqual(amountDelivered)
    }
    if (invoiceReceived !== undefined) {
      await expect(
        accountingService.getTotalReceived(invoice.id)
      ).resolves.toEqual(invoiceReceived)
    }
  }

  beforeAll(
    async (): Promise<void> => {
      Config.pricesUrl = 'https://test.prices'
      nock(Config.pricesUrl)
        .get('/')
        .reply(200, () => ({
          USD: 1.0, // base
          XRP: 2.0
        }))
        .persist()
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      accountingService = await deps.use('accountingService')
      ratesService = await deps.use('ratesService')

      asset = {
        scale: 9,
        code: 'USD'
      }

      knex = await deps.use('knex')
      config = await deps.use('config')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      outgoingPaymentService = await deps.use('outgoingPaymentService')
      const accountService = await deps.use('accountService')
      accountId = (await accountService.create({ asset })).id
      const destinationAsset = {
        scale: 9,
        code: 'XRP'
      }
      const destinationAccount = await accountService.create({
        asset: destinationAsset
      })
      // If the destination asset liquidity account isn't well funded,
      // Pay's rate probe will timeout due to backoffs after
      // receiving T04_INSUFFICIENT_LIQUIDITY replies.
      await expect(
        accountingService.createTransfer({
          sourceAccount: {
            asset: {
              unit: destinationAccount.asset.unit,
              account: AssetAccount.Settlement
            }
          },
          destinationAccount: {
            asset: {
              unit: destinationAccount.asset.unit,
              account: AssetAccount.Liquidity
            }
          },
          amount: BigInt(10e12)
        })
      ).resolves.toBeUndefined()
      accountUrl = `${config.publicHost}/pay/${destinationAccount.id}`
      paymentPointer = accountUrl.replace('https://', '$')
      const invoiceService = await deps.use('invoiceService')
      invoice = await invoiceService.create({
        accountId: destinationAccount.id,
        amountToReceive: BigInt(56),
        expiresAt: new Date(Date.now() + 60 * 1000),
        description: 'description!'
      })
      invoiceUrl = `${config.publicHost}/invoices/${invoice.id}`
      amtDelivered = BigInt(0)
    }
  )

  afterEach(
    async (): Promise<void> => {
      jest.useRealTimers()
      jest.restoreAllMocks()
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
    }
  )

  describe('get', (): void => {
    it('returns undefined when no payment exists', async () => {
      await expect(outgoingPaymentService.get(uuid())).resolves.toBeUndefined()
    })
  })

  describe('create', (): void => {
    it('creates an OutgoingPayment (FixedSend)', async () => {
      const payment = await outgoingPaymentService.create({
        accountId,
        paymentPointer,
        amountToSend: BigInt(123),
        autoApprove: false
      })
      expect(payment.state).toEqual(PaymentState.Quoting)
      expect(payment.intent).toEqual({
        paymentPointer,
        amountToSend: BigInt(123),
        autoApprove: false
      })
      expect(payment.accountId).toBe(accountId)
      await expectOutcome(payment, { amountSent: BigInt(0) })
      expect(payment.account.asset.code).toBe('USD')
      expect(payment.account.asset.scale).toBe(9)
      expect(payment.destinationAccount).toEqual({
        scale: 9,
        code: 'XRP',
        url: accountUrl
      })

      const payment2 = await outgoingPaymentService.get(payment.id)
      if (!payment2) throw 'no payment'
      expect(payment2.id).toEqual(payment.id)
    })

    it('creates an OutgoingPayment (FixedDelivery)', async () => {
      const payment = await outgoingPaymentService.create({
        accountId,
        invoiceUrl,
        autoApprove: false
      })
      expect(payment.state).toEqual(PaymentState.Quoting)
      expect(payment.intent).toEqual({
        invoiceUrl,
        autoApprove: false
      })
      expect(payment.accountId).toBe(accountId)
      await expectOutcome(payment, { amountSent: BigInt(0) })
      expect(payment.account.asset.code).toBe('USD')
      expect(payment.account.asset.scale).toBe(9)
      expect(payment.destinationAccount).toEqual({
        scale: invoice.account.asset.scale,
        code: invoice.account.asset.code,
        url: accountUrl
      })

      const payment2 = await outgoingPaymentService.get(payment.id)
      if (!payment2) throw 'no payment'
      expect(payment2.id).toEqual(payment.id)
    })

    it('fails to create with both invoice and paymentPointer', async () => {
      await expect(
        outgoingPaymentService.create({
          accountId,
          invoiceUrl,
          paymentPointer,
          autoApprove: false
        })
      ).rejects.toThrow(
        'invoiceUrl and (paymentPointer,amountToSend) are mutually exclusive'
      )
    })

    it('fails to create with both invoice and amountToSend', async () => {
      await expect(
        outgoingPaymentService.create({
          accountId,
          invoiceUrl,
          amountToSend: BigInt(123),
          autoApprove: false
        })
      ).rejects.toThrow(
        'invoiceUrl and (paymentPointer,amountToSend) are mutually exclusive'
      )
    })

    it('fails to create with nonexistent account', async () => {
      await expect(
        outgoingPaymentService.create({
          accountId: uuid(),
          paymentPointer,
          amountToSend: BigInt(123),
          autoApprove: false
        })
      ).rejects.toThrow('outgoing payment account does not exist')
    })
  })

  describe('processNext', (): void => {
    describe('Quoting→', (): void => {
      it('Ready (FixedSend)', async (): Promise<void> => {
        const paymentId = (
          await outgoingPaymentService.create({
            accountId,
            paymentPointer,
            amountToSend: BigInt(123),
            autoApprove: false
          })
        ).id
        const payment = await processNext(paymentId, PaymentState.Ready)
        if (!payment.quote) throw 'no quote'

        expect(payment.quote.timestamp).toBeInstanceOf(Date)
        expect(
          payment.quote.activationDeadline.getTime() - Date.now()
        ).toBeGreaterThan(0)
        expect(
          payment.quote.activationDeadline.getTime() - Date.now()
        ).toBeLessThanOrEqual(config.quoteLifespan)
        expect(payment.quote.targetType).toBe(Pay.PaymentType.FixedSend)
        expect(payment.quote.minDeliveryAmount).toBe(
          BigInt(Math.ceil(123 * payment.quote.minExchangeRate.valueOf()))
        )
        expect(payment.quote.maxSourceAmount).toBe(BigInt(123))
        expect(payment.quote.maxPacketAmount).toBe(
          BigInt('9223372036854775807')
        )
        expect(payment.quote.minExchangeRate.valueOf()).toBe(
          0.5 * (1 - config.slippage)
        )
        expect(payment.quote.lowExchangeRateEstimate.valueOf()).toBe(0.5)
        expect(payment.quote.highExchangeRateEstimate.valueOf()).toBe(
          0.500000000001
        )
      })

      it('Ready (FixedDelivery)', async (): Promise<void> => {
        const paymentId = (
          await outgoingPaymentService.create({
            accountId,
            invoiceUrl,
            autoApprove: false
          })
        ).id
        const payment = await processNext(paymentId, PaymentState.Ready)
        if (!payment.quote) throw 'no quote'

        expect(payment.quote.targetType).toBe(Pay.PaymentType.FixedDelivery)
        expect(payment.quote.minDeliveryAmount).toBe(BigInt(56))
        expect(payment.quote.maxSourceAmount).toBe(
          BigInt(Math.ceil(56 * 2 * (1 + config.slippage)))
        )
        expect(payment.quote.minExchangeRate.valueOf()).toBe(
          0.5 * (1 - config.slippage)
        )
        expect(payment.quote.lowExchangeRateEstimate.valueOf()).toBe(0.5)
        // This approaches 0.5 with higher invoice amounts.
        // The invoice account's receive limit returns F08 for larger
        // rate probe packet amounts.
        expect(payment.quote.highExchangeRateEstimate.valueOf()).toBe(
          0.5087719298245614
        )
      })

      it('Quoting (rate service error)', async (): Promise<void> => {
        const mockFn = jest
          .spyOn(ratesService, 'prices')
          .mockImplementation(() => Promise.reject(new Error('fail')))
        const paymentId = (
          await outgoingPaymentService.create({
            accountId,
            paymentPointer,
            amountToSend: BigInt(123),
            autoApprove: false
          })
        ).id
        const payment = await processNext(paymentId, PaymentState.Quoting)

        expect(payment.stateAttempts).toBe(1)
        expect(payment.quote).toBeUndefined()

        mockFn.mockRestore()
        // Fast forward to next attempt.
        // Only mock the time once (for getPendingPayment) since otherwise ilp/pay's startQuote will get confused.
        jest
          .spyOn(Date, 'now')
          .mockReturnValueOnce(Date.now() + 1 * RETRY_BACKOFF_SECONDS * 1000)

        const payment2 = await processNext(paymentId, PaymentState.Ready)
        expect(payment2.quote?.maxSourceAmount).toBe(BigInt(123))
      })

      // This mocks Quoting→Ready, but for it to trigger for real, it would go from Sending→Quoting(retry)→Ready (when the sending partially failed).
      it('Ready (FixedSend, 0<intent.amountToSend<amountSent)', async (): Promise<void> => {
        const payment = await outgoingPaymentService.create({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123),
          autoApprove: false
        })
        jest
          .spyOn(accountingService, 'getTotalSent')
          .mockImplementation(async (id: string) => {
            expect(id).toStrictEqual(payment.id)
            return BigInt(89)
          })
        const payment2 = await processNext(payment.id, PaymentState.Ready)
        expect(payment2.quote?.maxSourceAmount).toBe(BigInt(123 - 89))
      })

      // This mocks Quoting→Completed, but for it to trigger for real, it would go from Sending→Quoting(retry)→Completed (when the Sending→Completed transition failed to commit).
      it('Completed (FixedSend, intent.amountToSend===amountSent)', async (): Promise<void> => {
        const payment = await outgoingPaymentService.create({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123),
          autoApprove: false
        })
        jest
          .spyOn(accountingService, 'getTotalSent')
          .mockImplementation(async (id: string) => {
            expect(id).toStrictEqual(payment.id)
            return BigInt(123)
          })
        await processNext(payment.id, PaymentState.Completed)
      })

      // Maybe another person or payment paid the invoice already. Or it could be like the FixedSend case, where the Sending→Completed transition failed to commit, and this is a retry.
      it('Completed (FixedDelivery, invoice was already full paid)', async (): Promise<void> => {
        const paymentId = (
          await outgoingPaymentService.create({
            accountId,
            invoiceUrl,
            autoApprove: false
          })
        ).id
        assert.ok(invoice.amountToReceive)
        await payInvoice(invoice.amountToReceive)
        await processNext(paymentId, PaymentState.Completed)
      })

      it('Cancelled (destination asset changed)', async (): Promise<void> => {
        const originalPayment = await outgoingPaymentService.create({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123),
          autoApprove: false
        })
        const paymentId = originalPayment.id
        // Pretend that the destination asset was initially different.
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({
            destinationAccount: Object.assign(
              {},
              originalPayment.destinationAccount,
              {
                scale: 55
              }
            )
          })

        await processNext(
          paymentId,
          PaymentState.Cancelled,
          Pay.PaymentError.DestinationAssetConflict
        )
      })
    })

    describe('Ready→', (): void => {
      let paymentId: string

      beforeEach(
        async (): Promise<void> => {
          paymentId = (
            await outgoingPaymentService.create({
              accountId,
              paymentPointer,
              amountToSend: BigInt(123),
              autoApprove: true
            })
          ).id
          await processNext(paymentId, PaymentState.Ready)
        }
      )

      it('Cancelled (quote expired)', async (): Promise<void> => {
        jest.useFakeTimers('modern')
        jest.advanceTimersByTime(config.quoteLifespan + 1)

        await processNext(
          paymentId,
          PaymentState.Cancelled,
          LifecycleError.QuoteExpired
        )
      })

      it('Ready (waiting for liquidity)', async (): Promise<void> => {
        await processNext(paymentId, PaymentState.Ready)
      })
    })

    describe('Sending→', (): void => {
      async function setup(
        opts: Pick<
          PaymentIntent,
          'amountToSend' | 'paymentPointer' | 'invoiceUrl'
        >
      ): Promise<string> {
        const { id: paymentId } = await outgoingPaymentService.create({
          accountId,
          autoApprove: true,
          ...opts
        })

        trackAmountDelivered(paymentId)

        await processNext(paymentId, PaymentState.Ready)
        await expect(
          outgoingPaymentService.send(paymentId)
        ).resolves.toMatchObject({
          state: PaymentState.Sending
        })

        return paymentId
      }

      it('Completed (FixedSend)', async (): Promise<void> => {
        const paymentId = await setup({
          paymentPointer,
          amountToSend: BigInt(123)
        })

        const payment = await processNext(paymentId, PaymentState.Completed)
        await expectOutcome(payment, {
          amountSent: BigInt(123),
          amountDelivered: BigInt(Math.floor(123 / 2))
        })
      })

      it('Completed (FixedDelivery)', async (): Promise<void> => {
        const paymentId = await setup({
          invoiceUrl
        })

        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        assert.ok(invoice.amountToReceive)
        const amountSent = invoice.amountToReceive * BigInt(2)
        await expectOutcome(payment, {
          amountSent,
          amountDelivered: invoice.amountToReceive,
          invoiceReceived: invoice.amountToReceive
        })
      })

      it('Completed (FixedDelivery, with invoice initially partially paid)', async (): Promise<void> => {
        const amountAlreadyDelivered = BigInt(34)
        await payInvoice(amountAlreadyDelivered)
        const paymentId = await setup({
          invoiceUrl
        })

        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        assert.ok(invoice.amountToReceive)
        const amountSent =
          (invoice.amountToReceive - amountAlreadyDelivered) * BigInt(2)
        await expectOutcome(payment, {
          amountSent,
          amountDelivered: invoice.amountToReceive - amountAlreadyDelivered,
          invoiceReceived: invoice.amountToReceive
        })
      })

      it('Sending (partial payment then retryable Pay error)', async (): Promise<void> => {
        mockPay(
          {
            maxSourceAmount: BigInt(10),
            minDeliveryAmount: BigInt(5)
          },
          Pay.PaymentError.ClosedByReceiver
        )

        const paymentId = await setup({
          paymentPointer,
          amountToSend: BigInt(123)
        })

        for (let i = 0; i < 4; i++) {
          const payment = await processNext(paymentId, PaymentState.Sending)
          expect(payment.stateAttempts).toBe(i + 1)
          await expectOutcome(payment, {
            amountSent: BigInt(10 * (i + 1)),
            amountDelivered: BigInt(5 * (i + 1))
          })
          // Skip through the backoff timer.
          fastForwardToAttempt(payment.stateAttempts)
        }
        // Last attempt fails, but no more retries.
        const payment = await processNext(
          paymentId,
          PaymentState.Cancelled,
          Pay.PaymentError.ClosedByReceiver
        )
        expect(payment.stateAttempts).toBe(0)
        // "mockPay" allows a small amount of money to be paid every attempt.
        await expectOutcome(payment, {
          amountSent: BigInt(10 * 5),
          amountDelivered: BigInt(5 * 5)
        })
      })

      it('Cancelled (non-retryable Pay error)', async (): Promise<void> => {
        mockPay(
          {
            maxSourceAmount: BigInt(10),
            minDeliveryAmount: BigInt(5)
          },
          Pay.PaymentError.ReceiverProtocolViolation
        )
        const paymentId = await setup({
          paymentPointer,
          amountToSend: BigInt(123)
        })

        const payment = await processNext(
          paymentId,
          PaymentState.Cancelled,
          Pay.PaymentError.ReceiverProtocolViolation
        )
        await expectOutcome(payment, {
          amountSent: BigInt(10),
          amountDelivered: BigInt(5)
        })
      })

      it('→Sending→Completed (partial payment, resume, complete)', async (): Promise<void> => {
        const mockFn = mockPay(
          {
            maxSourceAmount: BigInt(10),
            minDeliveryAmount: BigInt(5)
          },
          Pay.PaymentError.ClosedByReceiver
        )
        const amountToSend = BigInt(123)
        const paymentId = await setup({
          paymentPointer,
          amountToSend
        })

        const payment = await processNext(paymentId, PaymentState.Sending)
        mockFn.mockRestore()
        fastForwardToAttempt(1)
        await expectOutcome(payment, {
          amountSent: BigInt(10),
          amountDelivered: BigInt(5)
        })

        // The next attempt is without the mock, so it succeeds.
        const payment2 = await processNext(paymentId, PaymentState.Completed)
        await expectOutcome(payment2, {
          amountSent: amountToSend,
          amountDelivered: amountToSend / BigInt(2)
        })
      })

      // Caused by retry after failed Sending→Completed transition commit.
      it('Completed (FixedSend, already fully paid)', async (): Promise<void> => {
        const paymentId = await setup({
          paymentPointer,
          amountToSend: BigInt(123)
        })

        await processNext(paymentId, PaymentState.Completed)
        // Pretend that the transaction didn't commit.
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({ state: PaymentState.Sending })
        const payment = await processNext(paymentId, PaymentState.Completed)
        await expectOutcome(payment, {
          amountSent: BigInt(123),
          amountDelivered: BigInt(123) / BigInt(2)
        })
      })

      // Caused by retry after failed Sending→Completed transition commit.
      it('Completed (FixedDelivery, already fully paid)', async (): Promise<void> => {
        const paymentId = await setup({
          invoiceUrl
        })
        // The quote thinks there's a full amount to pay, but actually sending will find the invoice has been paid (e.g. by another payment).
        assert.ok(invoice.amountToReceive)
        await payInvoice(invoice.amountToReceive)

        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        await expectOutcome(payment, {
          amountSent: BigInt(0),
          amountDelivered: BigInt(0),
          invoiceReceived: invoice.amountToReceive
        })
      })

      it('Cancelled (destination asset changed)', async (): Promise<void> => {
        const paymentId = await setup({
          invoiceUrl
        })
        // Pretend that the destination asset was initially different.
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({
            destinationAccount: {
              url: accountUrl,
              code: invoice.account.asset.code,
              scale: 55
            }
          })

        await processNext(
          paymentId,
          PaymentState.Cancelled,
          Pay.PaymentError.DestinationAssetConflict
        )
      })
    })
  })

  describe('requote', (): void => {
    let payment: OutgoingPayment
    beforeEach(
      async (): Promise<void> => {
        payment = await outgoingPaymentService.create({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123),
          autoApprove: false
        })
      }
    )

    it('fails when no payment exists', async (): Promise<void> => {
      await expect(outgoingPaymentService.requote(uuid())).rejects.toThrow(
        'payment does not exist'
      )
    })

    it('requotes a Cancelled payment', async (): Promise<void> => {
      await payment.$query().patch({
        state: PaymentState.Cancelled,
        error: 'Fail'
      })
      await expect(
        outgoingPaymentService.requote(payment.id)
      ).resolves.toMatchObject({
        id: payment.id,
        state: PaymentState.Quoting
      })

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Quoting)
      expect(after?.error).toBeNull()
    })

    Object.values(PaymentState).forEach((startState) => {
      if (startState === PaymentState.Cancelled) return
      it(`does not requote a ${startState} payment`, async (): Promise<void> => {
        await payment.$query().patch({
          state: startState,
          error: 'Fail'
        })
        await expect(
          outgoingPaymentService.requote(payment.id)
        ).rejects.toThrow(`Cannot quote; payment is in state=${startState}`)

        const after = await outgoingPaymentService.get(payment.id)
        expect(after?.state).toBe(startState)
        expect(after?.error).toBe('Fail')
      })
    })
  })

  describe('send', (): void => {
    let payment: OutgoingPayment
    beforeEach(async (): Promise<void> => {
      payment = await outgoingPaymentService.create({
        accountId,
        paymentPointer,
        amountToSend: BigInt(123),
        autoApprove: false
      })
      await processNext(payment.id, PaymentState.Ready)
    }, 10_000)

    it('fails when no payment exists', async (): Promise<void> => {
      await expect(outgoingPaymentService.send(uuid())).rejects.toThrow(
        'payment does not exist'
      )
    })

    it('transitions a Ready payment to Sending state', async (): Promise<void> => {
      await expect(
        outgoingPaymentService.send(payment.id)
      ).resolves.toMatchObject({
        id: payment.id,
        state: PaymentState.Sending
      })

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Sending)
    })

    Object.values(PaymentState).forEach((startState) => {
      if (startState === PaymentState.Ready) return
      it(`does not activate a ${startState} payment`, async (): Promise<void> => {
        await payment.$query().patch({ state: startState })
        await expect(outgoingPaymentService.send(payment.id)).rejects.toThrow(
          `Cannot send; payment is in state=${startState}`
        )

        const after = await outgoingPaymentService.get(payment.id)
        expect(after?.state).toBe(startState)
      })
    })
  })

  describe('cancel', (): void => {
    let payment: OutgoingPayment
    beforeEach(
      async (): Promise<void> => {
        payment = await outgoingPaymentService.create({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123),
          autoApprove: false
        })
      }
    )

    it('fails when no payment exists', async (): Promise<void> => {
      await expect(outgoingPaymentService.cancel(uuid())).rejects.toThrow(
        'payment does not exist'
      )
    })

    it('cancels a Ready payment', async (): Promise<void> => {
      await payment.$query().patch({ state: PaymentState.Ready })
      await expect(
        outgoingPaymentService.cancel(payment.id)
      ).resolves.toMatchObject({
        id: payment.id,
        state: PaymentState.Cancelled
      })

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Cancelled)
      expect(after?.error).toBe('CancelledByAPI')
    })

    Object.values(PaymentState).forEach((startState) => {
      if (startState === PaymentState.Ready) return
      it(`does not cancel a ${startState} payment`, async (): Promise<void> => {
        await payment.$query().patch({ state: startState })
        await expect(outgoingPaymentService.cancel(payment.id)).rejects.toThrow(
          `Cannot cancel; payment is in state=${startState}`
        )

        const after = await outgoingPaymentService.get(payment.id)
        expect(after?.state).toBe(startState)
      })
    })
  })

  describe('getAccountPage', () => {
    let paymentsCreated: OutgoingPayment[]

    beforeEach(async (): Promise<void> => {
      paymentsCreated = []
      for (let i = 0; i < 40; i++) {
        paymentsCreated.push(
          await outgoingPaymentService.create({
            accountId,
            paymentPointer,
            amountToSend: BigInt(123),
            autoApprove: false
          })
        )
      }
    }, 10_000)

    afterEach(
      async (): Promise<void> => {
        await truncateTable(knex, 'outgoingPayments')
      }
    )

    test('Defaults to fetching first 20 items', async (): Promise<void> => {
      const payments = await outgoingPaymentService.getAccountPage(accountId)
      expect(payments).toHaveLength(20)
      expect(payments[0].id).toEqual(paymentsCreated[0].id)
      expect(payments[19].id).toEqual(paymentsCreated[19].id)
      expect(payments[20]).toBeUndefined()
    })

    test('Can change forward pagination limit', async (): Promise<void> => {
      const pagination = {
        first: 10
      }
      const payments = await outgoingPaymentService.getAccountPage(
        accountId,
        pagination
      )
      expect(payments).toHaveLength(10)
      expect(payments[0].id).toEqual(paymentsCreated[0].id)
      expect(payments[9].id).toEqual(paymentsCreated[9].id)
      expect(payments[10]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor', async (): Promise<void> => {
      const pagination = {
        after: paymentsCreated[19].id
      }
      const payments = await outgoingPaymentService.getAccountPage(
        accountId,
        pagination
      )
      expect(payments).toHaveLength(20)
      expect(payments[0].id).toEqual(paymentsCreated[20].id)
      expect(payments[19].id).toEqual(paymentsCreated[39].id)
      expect(payments[20]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor with a limit', async (): Promise<void> => {
      const pagination = {
        first: 10,
        after: paymentsCreated[9].id
      }
      const payments = await outgoingPaymentService.getAccountPage(
        accountId,
        pagination
      )
      expect(payments).toHaveLength(10)
      expect(payments[0].id).toEqual(paymentsCreated[10].id)
      expect(payments[9].id).toEqual(paymentsCreated[19].id)
      expect(payments[10]).toBeUndefined()
    })

    test("Can't change backward pagination limit on it's own.", async (): Promise<void> => {
      const pagination = {
        last: 10
      }
      const payments = outgoingPaymentService.getAccountPage(
        accountId,
        pagination
      )
      await expect(payments).rejects.toThrow(
        "Can't paginate backwards from the start."
      )
    })

    test('Can paginate backwards from a cursor', async (): Promise<void> => {
      const pagination = {
        before: paymentsCreated[20].id
      }
      const payments = await outgoingPaymentService.getAccountPage(
        accountId,
        pagination
      )
      expect(payments).toHaveLength(20)
      expect(payments[0].id).toEqual(paymentsCreated[0].id)
      expect(payments[19].id).toEqual(paymentsCreated[19].id)
      expect(payments[20]).toBeUndefined()
    })

    test('Can paginate backwards from a cursor with a limit', async (): Promise<void> => {
      const pagination = {
        last: 5,
        before: paymentsCreated[10].id
      }
      const payments = await outgoingPaymentService.getAccountPage(
        accountId,
        pagination
      )
      expect(payments).toHaveLength(5)
      expect(payments[0].id).toEqual(paymentsCreated[5].id)
      expect(payments[4].id).toEqual(paymentsCreated[9].id)
      expect(payments[5]).toBeUndefined()
    })

    test('Backwards/Forwards pagination results in same order.', async (): Promise<void> => {
      const paginationForwards = {
        first: 10
      }
      const paymentsForwards = await outgoingPaymentService.getAccountPage(
        accountId,
        paginationForwards
      )
      const paginationBackwards = {
        last: 10,
        before: paymentsCreated[10].id
      }
      const paymentsBackwards = await outgoingPaymentService.getAccountPage(
        accountId,
        paginationBackwards
      )
      expect(paymentsForwards).toHaveLength(10)
      expect(paymentsBackwards).toHaveLength(10)
      expect(paymentsForwards).toEqual(paymentsBackwards)
    })

    test('Providing before and after results in forward pagination', async (): Promise<void> => {
      const pagination = {
        after: paymentsCreated[19].id,
        before: paymentsCreated[19].id
      }
      const payments = await outgoingPaymentService.getAccountPage(
        accountId,
        pagination
      )
      expect(payments).toHaveLength(20)
      expect(payments[0].id).toEqual(paymentsCreated[20].id)
      expect(payments[19].id).toEqual(paymentsCreated[39].id)
      expect(payments[20]).toBeUndefined()
    })

    test("Can't request less than 0 payments", async (): Promise<void> => {
      const pagination = {
        first: -1
      }
      const payments = outgoingPaymentService.getAccountPage(
        accountId,
        pagination
      )
      await expect(payments).rejects.toThrow('Pagination index error')
    })

    test("Can't request more than 100 payments", async (): Promise<void> => {
      const pagination = {
        first: 101
      }
      const payments = outgoingPaymentService.getAccountPage(
        accountId,
        pagination
      )
      await expect(payments).rejects.toThrow('Pagination index error')
    })
  })
})
