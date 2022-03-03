import assert from 'assert'
import nock from 'nock'
import Knex from 'knex'
import * as Pay from '@interledger/pay'
import { v4 as uuid } from 'uuid'

import { FundingError } from './errors'
import { OutgoingPaymentService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { IAppConfig, Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import {
  OutgoingPayment,
  PaymentIntent,
  PaymentState,
  PaymentEvent,
  PaymentEventType
} from './model'
import { LifecycleError } from './errors'
import { RETRY_BACKOFF_SECONDS } from './worker'
import { isTransferError } from '../accounting/errors'
import { AccountingService, TransferOptions } from '../accounting/service'
import { AssetOptions } from '../asset/service'
import { IncomingPayment } from '../open_payments/payment/incoming/model'
import { RatesService } from '../rates/service'
import { Pagination } from '../shared/baseModel'
import { getPageTests } from '../shared/baseModel.test'

describe('OutgoingPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let outgoingPaymentService: OutgoingPaymentService
  let ratesService: RatesService
  let accountingService: AccountingService
  let knex: Knex
  let accountId: string
  let asset: AssetOptions
  let incomingPayment: IncomingPayment
  let incomingPaymentUrl: string
  let accountUrl: string
  let paymentPointer: string
  let amtDelivered: bigint
  let config: IAppConfig

  const webhookTypes: {
    [key in PaymentState]: PaymentEventType | undefined
  } = {
    [PaymentState.Quoting]: undefined,
    [PaymentState.Funding]: PaymentEventType.PaymentFunding,
    [PaymentState.Sending]: undefined,
    [PaymentState.Cancelled]: PaymentEventType.PaymentCancelled,
    [PaymentState.Completed]: PaymentEventType.PaymentCompleted
  }

  async function processNext(
    paymentId: string,
    expectState: PaymentState,
    expectedError?: string
  ): Promise<OutgoingPayment> {
    await expect(outgoingPaymentService.processNext()).resolves.toBe(paymentId)
    const payment = await outgoingPaymentService.get(paymentId)
    if (!payment) throw 'no payment'
    if (expectState) expect(payment.state).toBe(expectState)
    expect(payment.error).toEqual(expectedError || null)
    const type = webhookTypes[payment.state]
    if (type) {
      await expect(
        PaymentEvent.query(knex).where({
          type
        })
      ).resolves.not.toHaveLength(0)
    }
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

  async function payIncomingPayment(amount: bigint): Promise<void> {
    await expect(
      accountingService.createDeposit({
        id: uuid(),
        account: incomingPayment,
        amount
      })
    ).resolves.toBeUndefined()
  }

  function trackAmountDelivered(sourceAccountId: string): void {
    const { createTransfer } = accountingService
    jest
      .spyOn(accountingService, 'createTransfer')
      .mockImplementation(async (options: TransferOptions) => {
        const trxOrError = await createTransfer(options)
        if (
          !isTransferError(trxOrError) &&
          options.sourceAccount.id === sourceAccountId
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
      accountBalance,
      incomingPaymentReceived,
      withdrawAmount
    }: {
      amountSent?: bigint
      amountDelivered?: bigint
      accountBalance?: bigint
      incomingPaymentReceived?: bigint
      withdrawAmount?: bigint
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
    if (accountBalance !== undefined) {
      await expect(accountingService.getBalance(payment.id)).resolves.toEqual(
        accountBalance
      )
    }
    if (incomingPaymentReceived !== undefined) {
      await expect(
        accountingService.getTotalReceived(incomingPayment.id)
      ).resolves.toEqual(incomingPaymentReceived)
    }
    if (withdrawAmount !== undefined) {
      await expect(
        PaymentEvent.query(knex).where({
          withdrawalAccountId: payment.id,
          withdrawalAmount: withdrawAmount
        })
      ).resolves.toHaveLength(1)
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
      await expect(
        accountingService.createDeposit({
          id: uuid(),
          account: destinationAccount.asset,
          amount: BigInt(123)
        })
      ).resolves.toBeUndefined()
      accountUrl = `${config.publicHost}/pay/${destinationAccount.id}`
      paymentPointer = accountUrl.replace('https://', '$')
      const incomingPaymentService = await deps.use('incomingPaymentService')
      incomingPayment = await incomingPaymentService.create({
        accountId: destinationAccount.id,
        amount: BigInt(56),
        expiresAt: new Date(Date.now() + 60 * 1000),
        description: 'description!'
      })
      incomingPaymentUrl = `${config.publicHost}/incoming-payments/${incomingPayment.id}`
      amtDelivered = BigInt(0)
    }
  )

  afterEach(
    async (): Promise<void> => {
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
      await expectOutcome(payment, { accountBalance: BigInt(0) })
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
        incomingPaymentUrl,
        autoApprove: false
      })
      expect(payment.state).toEqual(PaymentState.Quoting)
      expect(payment.intent).toEqual({
        incomingPaymentUrl,
        autoApprove: false
      })
      expect(payment.accountId).toBe(accountId)
      await expectOutcome(payment, { accountBalance: BigInt(0) })
      expect(payment.account.asset.code).toBe('USD')
      expect(payment.account.asset.scale).toBe(9)
      expect(payment.destinationAccount).toEqual({
        scale: incomingPayment.account.asset.scale,
        code: incomingPayment.account.asset.code,
        url: accountUrl
      })

      const payment2 = await outgoingPaymentService.get(payment.id)
      if (!payment2) throw 'no payment'
      expect(payment2.id).toEqual(payment.id)
    })

    it('fails to create with both incomingPayment and paymentPointer', async () => {
      await expect(
        outgoingPaymentService.create({
          accountId,
          incomingPaymentUrl,
          paymentPointer,
          autoApprove: false
        })
      ).rejects.toThrow(
        'incomingPaymentUrl and (paymentPointer,amountToSend) are mutually exclusive'
      )
    })

    it('fails to create with both incomingPayment and amountToSend', async () => {
      await expect(
        outgoingPaymentService.create({
          accountId,
          incomingPaymentUrl,
          amountToSend: BigInt(123),
          autoApprove: false
        })
      ).rejects.toThrow(
        'incomingPaymentUrl and (paymentPointer,amountToSend) are mutually exclusive'
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
    describe('QUOTING→', (): void => {
      it('FUNDING (FixedSend)', async (): Promise<void> => {
        const paymentId = (
          await outgoingPaymentService.create({
            accountId,
            paymentPointer,
            amountToSend: BigInt(123),
            autoApprove: false
          })
        ).id
        const payment = await processNext(paymentId, PaymentState.Funding)
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

      it('FUNDING (FixedDelivery)', async (): Promise<void> => {
        const paymentId = (
          await outgoingPaymentService.create({
            accountId,
            incomingPaymentUrl: incomingPaymentUrl,
            autoApprove: false
          })
        ).id
        const payment = await processNext(paymentId, PaymentState.Funding)
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
        expect(payment.quote.highExchangeRateEstimate.valueOf()).toBe(
          0.500000000001
        )
      })

      it('QUOTING (rate service error)', async (): Promise<void> => {
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

        const payment2 = await processNext(paymentId, PaymentState.Funding)
        expect(payment2.quote?.maxSourceAmount).toBe(BigInt(123))
      })

      // This mocks QUOTING→FUNDING, but for it to trigger for real, it would go from SENDING→QUOTING(retry)→FUNDING (when the sending partially failed).
      it('FUNDING (FixedSend, 0<intent.amountToSend<amountSent)', async (): Promise<void> => {
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
        const payment2 = await processNext(payment.id, PaymentState.Funding)
        expect(payment2.quote?.maxSourceAmount).toBe(BigInt(123 - 89))
      })

      // This mocks QUOTING→COMPLETED, but for it to trigger for real, it would go from SENDING→QUOTING(retry)→COMPLETED (when the SENDING→COMPLETED transition failed to commit).
      it('COMPLETED (FixedSend, intent.amountToSend===amountSent)', async (): Promise<void> => {
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

      // Maybe another person or payment paid the incoming payment already. Or it could be like the FixedSend case, where the SENDING→COMPLETED transition failed to commit, and this is a retry.
      it('COMPLETED (FixedDelivery, incoming payment was already full paid)', async (): Promise<void> => {
        const paymentId = (
          await outgoingPaymentService.create({
            accountId,
            incomingPaymentUrl: incomingPaymentUrl,
            autoApprove: false
          })
        ).id
        await payIncomingPayment(incomingPayment.amount)
        await processNext(paymentId, PaymentState.Completed)
      })

      it('CANCELLED (destination asset changed)', async (): Promise<void> => {
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

    describe('FUNDING→', (): void => {
      let payment: OutgoingPayment

      beforeEach(
        async (): Promise<void> => {
          const { id: paymentId } = await outgoingPaymentService.create({
            accountId,
            paymentPointer,
            amountToSend: BigInt(123),
            autoApprove: true
          })
          payment = await processNext(paymentId, PaymentState.Funding)
        }
      )

      it('CANCELLED (quote expired)', async (): Promise<void> => {
        // nock doesn't work with 'modern' fake timers
        // https://github.com/nock/nock/issues/2200
        // jest.useFakeTimers('modern')
        // jest.advanceTimersByTime(config.quoteLifespan + 1)

        await payment.$query(knex).patch({
          quote: Object.assign({}, payment.quote, {
            activationDeadline: new Date(Date.now() - config.quoteLifespan - 1)
          })
        })

        await processNext(
          payment.id,
          PaymentState.Cancelled,
          LifecycleError.QuoteExpired
        )
      })
    })

    describe('SENDING→', (): void => {
      async function setup(
        opts: Pick<
          PaymentIntent,
          'amountToSend' | 'paymentPointer' | 'incomingPaymentUrl'
        >
      ): Promise<string> {
        const { id: paymentId } = await outgoingPaymentService.create({
          accountId,
          autoApprove: true,
          ...opts
        })

        trackAmountDelivered(paymentId)

        const payment = await processNext(paymentId, PaymentState.Funding)
        assert.ok(payment.quote)
        await expect(
          outgoingPaymentService.fund({
            id: paymentId,
            amount: payment.quote.maxSourceAmount,
            transferId: uuid()
          })
        ).resolves.toMatchObject({
          state: PaymentState.Sending
        })

        return paymentId
      }

      it('COMPLETED (FixedSend)', async (): Promise<void> => {
        const paymentId = await setup({
          paymentPointer,
          amountToSend: BigInt(123)
        })

        const payment = await processNext(paymentId, PaymentState.Completed)
        await expectOutcome(payment, {
          accountBalance: BigInt(0),
          amountSent: BigInt(123),
          amountDelivered: BigInt(Math.floor(123 / 2))
        })
      })

      it('COMPLETED (FixedDelivery)', async (): Promise<void> => {
        const paymentId = await setup({
          incomingPaymentUrl: incomingPaymentUrl
        })

        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        const amountSent = incomingPayment.amount * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount - amountSent,
          amountSent,
          amountDelivered: incomingPayment.amount,
          incomingPaymentReceived: incomingPayment.amount,
          withdrawAmount: payment.quote.maxSourceAmount - amountSent
        })
      })

      it('COMPLETED (FixedDelivery, with incoming payment initially partially paid)', async (): Promise<void> => {
        const amountAlreadyDelivered = BigInt(34)
        await payIncomingPayment(amountAlreadyDelivered)
        const paymentId = await setup({
          incomingPaymentUrl: incomingPaymentUrl
        })

        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        const amountSent =
          (incomingPayment.amount - amountAlreadyDelivered) * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount - amountSent,
          amountSent,
          amountDelivered: incomingPayment.amount - amountAlreadyDelivered,
          incomingPaymentReceived: incomingPayment.amount,
          withdrawAmount: payment.quote.maxSourceAmount - amountSent
        })
      })

      it('SENDING (partial payment then retryable Pay error)', async (): Promise<void> => {
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
          accountBalance: BigInt(123 - 10 * 5),
          amountSent: BigInt(10 * 5),
          amountDelivered: BigInt(5 * 5),
          withdrawAmount: BigInt(123 - 10 * 5)
        })
      })

      it('CANCELLED (non-retryable Pay error)', async (): Promise<void> => {
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
          accountBalance: BigInt(123 - 10),
          amountSent: BigInt(10),
          amountDelivered: BigInt(5),
          withdrawAmount: BigInt(123 - 10)
        })
      })

      it('SENDING→COMPLETED (partial payment, resume, complete)', async (): Promise<void> => {
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
          accountBalance: BigInt(123 - 10),
          amountSent: BigInt(10),
          amountDelivered: BigInt(5)
        })

        // The next attempt is without the mock, so it succeeds.
        const payment2 = await processNext(paymentId, PaymentState.Completed)
        await expectOutcome(payment2, {
          accountBalance: BigInt(0),
          amountSent: amountToSend,
          amountDelivered: amountToSend / BigInt(2)
        })
      })

      // Caused by retry after failed SENDING→COMPLETED transition commit.
      it('COMPLETED (FixedSend, already fully paid)', async (): Promise<void> => {
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
          accountBalance: BigInt(0),
          amountSent: BigInt(123),
          amountDelivered: BigInt(123) / BigInt(2)
        })
      })

      // Caused by retry after failed SENDING→COMPLETED transition commit.
      it('COMPLETED (FixedDelivery, already fully paid)', async (): Promise<void> => {
        const paymentId = await setup({
          incomingPaymentUrl: incomingPaymentUrl
        })
        // The quote thinks there's a full amount to pay, but actually sending will find the incoming payment has been paid (e.g. by another payment).
        await payIncomingPayment(incomingPayment.amount)

        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount,
          amountSent: BigInt(0),
          amountDelivered: BigInt(0),
          incomingPaymentReceived: incomingPayment.amount,
          withdrawAmount: payment.quote.maxSourceAmount
        })
      })

      it('CANCELLED (destination asset changed)', async (): Promise<void> => {
        const paymentId = await setup({
          incomingPaymentUrl: incomingPaymentUrl
        })
        // Pretend that the destination asset was initially different.
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({
            destinationAccount: {
              url: accountUrl,
              code: incomingPayment.account.asset.code,
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

  describe('fund', (): void => {
    let payment: OutgoingPayment
    let quoteAmount: bigint

    beforeEach(async (): Promise<void> => {
      const { id: paymentId } = await outgoingPaymentService.create({
        accountId,
        paymentPointer,
        amountToSend: BigInt(123),
        autoApprove: false
      })
      payment = await processNext(paymentId, PaymentState.Funding)
      assert.ok(payment.quote)
      quoteAmount = payment.quote.maxSourceAmount
      await expectOutcome(payment, { accountBalance: BigInt(0) })
    }, 10_000)

    it('fails when no payment exists', async (): Promise<void> => {
      await expect(
        outgoingPaymentService.fund({
          id: uuid(),
          amount: quoteAmount,
          transferId: uuid()
        })
      ).resolves.toEqual(FundingError.UnknownPayment)
    })

    it('transitions a Funding payment to Sending state', async (): Promise<void> => {
      await expect(
        outgoingPaymentService.fund({
          id: payment.id,
          amount: quoteAmount,
          transferId: uuid()
        })
      ).resolves.toMatchObject({
        id: payment.id,
        state: PaymentState.Sending
      })

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Sending)
      await expectOutcome(payment, { accountBalance: quoteAmount })
    })

    it('fails for invalid funding amount', async (): Promise<void> => {
      await expect(
        outgoingPaymentService.fund({
          id: payment.id,
          amount: quoteAmount - BigInt(1),
          transferId: uuid()
        })
      ).resolves.toEqual(FundingError.InvalidAmount)

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Funding)
      await expectOutcome(payment, { accountBalance: BigInt(0) })
    })

    Object.values(PaymentState).forEach((startState) => {
      if (startState === PaymentState.Funding) return
      it(`does not fund a ${startState} payment`, async (): Promise<void> => {
        await payment.$query().patch({ state: startState })
        await expect(
          outgoingPaymentService.fund({
            id: payment.id,
            amount: quoteAmount,
            transferId: uuid()
          })
        ).resolves.toEqual(FundingError.WrongState)

        const after = await outgoingPaymentService.get(payment.id)
        expect(after?.state).toBe(startState)
      })
    })
  })

  describe('getAccountPage', (): void => {
    getPageTests({
      createModel: () =>
        outgoingPaymentService.create({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123),
          autoApprove: false
        }),
      getPage: (pagination: Pagination) =>
        outgoingPaymentService.getAccountPage(accountId, pagination)
    })
  })
})
