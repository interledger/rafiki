import assert from 'assert'
import nock from 'nock'
import Knex from 'knex'
import * as Pay from '@interledger/pay'
import { URL } from 'url'
import { v4 as uuid } from 'uuid'

import { CreateOutgoingPaymentOptions, OutgoingPaymentService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { IAppConfig, Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { PaymentFactory } from '../tests/paymentFactory'
import { truncateTable, truncateTables } from '../tests/tableManager'
import { OutgoingPayment, PaymentIntent, PaymentState } from './model'
import {
  CreateError,
  isCreateError,
  LifecycleError,
  OutgoingPaymentError
} from './errors'
import { RETRY_BACKOFF_SECONDS } from './worker'
import { isTransferError } from '../accounting/errors'
import { AccountingService, TransferOptions } from '../accounting/service'
import { AssetOptions } from '../asset/service'
import { Invoice } from '../open_payments/invoice/model'
import { isCreateError as isCreateMandateError } from '../open_payments/mandate/errors'
import { Mandate } from '../open_payments/mandate/model'
import { MandateService } from '../open_payments/mandate/service'
import { isRateError, RatesService } from '../rates/service'
import { EventType } from '../webhook/service'

describe('OutgoingPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let outgoingPaymentService: OutgoingPaymentService
  let ratesService: RatesService
  let accountingService: AccountingService
  let mandateService: MandateService
  let paymentFactory: PaymentFactory
  let knex: Knex
  let accountId: string
  let asset: AssetOptions
  let invoice: Invoice
  let invoiceUrl: string
  let accountUrl: string
  let paymentPointer: string
  let amtDelivered: bigint
  let config: IAppConfig

  const webhookUrl = new URL(Config.webhookUrl)

  enum WebhookState {
    Funding = PaymentState.Funding,
    Cancelled = PaymentState.Cancelled,
    Completed = PaymentState.Completed
  }

  const isWebhookState = (state: PaymentState): boolean =>
    Object.values(WebhookState).includes(state)

  const webhookTypes: {
    [key in WebhookState]: EventType
  } = {
    [WebhookState.Funding]: EventType.PaymentFunding,
    [WebhookState.Cancelled]: EventType.PaymentCancelled,
    [WebhookState.Completed]: EventType.PaymentCompleted
  }

  function mockWebhookServer(
    paymentId: string,
    state: PaymentState
  ): nock.Scope | undefined {
    if (isWebhookState(state)) {
      return nock(webhookUrl.origin)
        .post(webhookUrl.pathname, (body): boolean => {
          expect(body.type).toEqual(webhookTypes[state])
          expect(body.data.payment.id).toEqual(paymentId)
          expect(body.data.payment.state).toEqual(state)
          return true
        })
        .reply(200)
    }
  }

  async function processNext(
    paymentId: string,
    expectState: PaymentState,
    expectedError?: string
  ): Promise<OutgoingPayment> {
    const scope = mockWebhookServer(paymentId, expectState)
    await expect(outgoingPaymentService.processNext()).resolves.toBe(paymentId)
    if (scope) {
      expect(scope.isDone()).toBe(true)
    }
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
    await expect(
      accountingService.createDeposit({
        id: uuid(),
        accountId: invoice.id,
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
      invoiceReceived
    }: {
      amountSent?: bigint
      amountDelivered?: bigint
      accountBalance?: bigint
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
    if (accountBalance !== undefined) {
      await expect(accountingService.getBalance(payment.id)).resolves.toEqual(
        accountBalance
      )
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
          XRP: 2.0,
          EUR: 0.8 // for mandates
        }))
        .persist()
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      accountingService = await deps.use('accountingService')
      mandateService = await deps.use('mandateService')
      ratesService = await deps.use('ratesService')
      paymentFactory = new PaymentFactory(deps)

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
          asset: {
            unit: destinationAccount.asset.unit
          },
          amount: BigInt(123)
        })
      ).resolves.toBeUndefined()
      accountUrl = `${config.publicHost}/pay/${destinationAccount.id}`
      paymentPointer = accountUrl.replace('https://', '$')
      const invoiceService = await deps.use('invoiceService')
      invoice = await invoiceService.create({
        accountId: destinationAccount.id,
        amount: BigInt(56),
        expiresAt: new Date(Date.now() + 60 * 1000),
        description: 'description!'
      })
      invoiceUrl = `${config.publicHost}/invoices/${invoice.id}`
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
    let mandate: Mandate

    beforeEach(
      async (): Promise<void> => {
        mandate = (await mandateService.create({
          accountId,
          amount: BigInt(100),
          assetCode: asset.code,
          assetScale: asset.scale
        })) as Mandate
        assert.ok(!isCreateMandateError(mandate))
      }
    )

    it('creates an OutgoingPayment (FixedSend)', async () => {
      const payment = await outgoingPaymentService.create({
        accountId,
        paymentPointer,
        amountToSend: BigInt(123)
      })
      assert.ok(!isCreateError(payment))
      expect(payment.state).toEqual(PaymentState.Quoting)
      expect(payment.intent).toEqual({
        paymentPointer,
        amountToSend: BigInt(123)
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
        invoiceUrl
      })
      assert.ok(!isCreateError(payment))
      expect(payment.state).toEqual(PaymentState.Quoting)
      expect(payment.intent).toEqual({
        invoiceUrl
      })
      expect(payment.accountId).toBe(accountId)
      await expectOutcome(payment, { accountBalance: BigInt(0) })
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

    it('creates an OutgoingPayment (Mandate Charge)', async () => {
      const payment = await outgoingPaymentService.create({
        mandateId: mandate.id,
        invoiceUrl
      })
      assert.ok(!isCreateError(payment))
      expect(payment.state).toEqual(PaymentState.Quoting)
      expect(payment.intent).toEqual({
        invoiceUrl
      })
      expect(payment.accountId).toBe(accountId)
      expect(payment.mandateId).toBe(mandate.id)
      await expectOutcome(payment, { accountBalance: BigInt(0) })

      await expect(outgoingPaymentService.get(payment.id)).resolves.toEqual(
        payment
      )
    })

    it('fails to create with nonexistent account', async () => {
      await expect(
        outgoingPaymentService.create({
          accountId: uuid(),
          paymentPointer,
          amountToSend: BigInt(123)
        })
      ).resolves.toEqual(CreateError.UnknownAccount)
    })

    it('fails to create with nonexistent mandate', async () => {
      await expect(
        outgoingPaymentService.create({
          mandateId: uuid(),
          invoiceUrl
        })
      ).resolves.toEqual(CreateError.UnknownMandate)
    })

    it('fails to create with revoked mandate', async () => {
      await mandateService.revoke(mandate.id)
      await expect(
        outgoingPaymentService.create({
          mandateId: mandate.id,
          invoiceUrl
        })
      ).resolves.toEqual(CreateError.InvalidMandate)
    })

    it('fails to create with expired mandate', async () => {
      await mandate.$query(knex).patch({ expiresAt: new Date(Date.now() - 1) })
      await expect(
        outgoingPaymentService.create({
          mandateId: mandate.id,
          invoiceUrl
        })
      ).resolves.toEqual(CreateError.InvalidMandate)
    })

    it('fails to create with inactive mandate', async () => {
      await mandate
        .$query(knex)
        .patch({ startAt: new Date(Date.now() + 30_000) })
      await expect(
        outgoingPaymentService.create({
          mandateId: mandate.id,
          invoiceUrl
        })
      ).resolves.toEqual(CreateError.InvalidMandate)
    })
  })

  describe('processNext', (): void => {
    describe('Quoting→', (): void => {
      it('Funding (FixedSend)', async (): Promise<void> => {
        const paymentId = (
          await paymentFactory.build({
            accountId,
            paymentPointer,
            amountToSend: BigInt(123)
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

      it('Funding (FixedDelivery)', async (): Promise<void> => {
        const paymentId = (
          await paymentFactory.build({
            accountId,
            invoiceUrl
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

      it('Funding (mandate charge, source asset)', async (): Promise<void> => {
        const mandate = await mandateService.create({
          accountId,
          amount: BigInt(200),
          assetCode: asset.code,
          assetScale: asset.scale,
          interval: 'P1M'
        })
        assert.ok(!isCreateMandateError(mandate))

        const { id: paymentId } = await paymentFactory.build({
          mandateId: mandate.id,
          invoiceUrl
        })
        const payment = await processNext(paymentId, PaymentState.Funding)
        expect(payment.mandateExchangeRate?.valueOf()).toBe(1.0)
        expect(payment.mandateRefundDeadline).toStrictEqual(mandate.processAt)
        assert.ok(payment.quote?.maxSourceAmount)
        const expectedBalance = mandate.balance - payment.quote?.maxSourceAmount
        expect(payment.mandate?.balance).toEqual(expectedBalance)
        await expect(mandateService.get(mandate.id)).resolves.toMatchObject({
          balance: expectedBalance
        })
      })

      it('Funding (mandate charge, destination asset)', async (): Promise<void> => {
        const mandate = await mandateService.create({
          accountId,
          amount: invoice.amount,
          assetCode: invoice.account.asset.code,
          assetScale: invoice.account.asset.scale,
          interval: 'P1M'
        })
        assert.ok(!isCreateMandateError(mandate))

        const { id: paymentId } = await paymentFactory.build({
          mandateId: mandate.id,
          invoiceUrl
        })
        const payment = await processNext(paymentId, PaymentState.Funding)
        expect(payment.mandateExchangeRate?.valueOf()).toBe(1.0)
        expect(payment.mandateRefundDeadline).toStrictEqual(mandate.processAt)
        assert.ok(payment.quote?.minDeliveryAmount)
        const expectedBalance =
          mandate.balance - payment.quote?.minDeliveryAmount
        expect(payment.mandate?.balance).toEqual(expectedBalance)
        await expect(mandateService.get(mandate.id)).resolves.toMatchObject({
          balance: expectedBalance
        })
      })

      it('Funding (mandate charge, arbitrary asset)', async (): Promise<void> => {
        const mandate = await mandateService.create({
          accountId,
          amount: BigInt(200),
          assetCode: 'EUR',
          assetScale: asset.scale,
          interval: 'P1M'
        })
        assert.ok(!isCreateMandateError(mandate))

        const { id: paymentId } = await paymentFactory.build({
          mandateId: mandate.id,
          invoiceUrl
        })
        const payment = await processNext(paymentId, PaymentState.Funding)
        assert.ok(payment.quote?.maxSourceAmount)
        const exchangeRate = await ratesService.getRate({
          sourceAssetCode: asset.code,
          destinationAssetCode: mandate.assetCode
        })
        assert.ok(!isRateError(exchangeRate))
        expect(payment.mandateExchangeRate).toBe(exchangeRate)
        expect(payment.mandateRefundDeadline).toStrictEqual(mandate.processAt)
        const expectedBalance =
          mandate.balance -
          BigInt(Math.floor(+payment.quote.maxSourceAmount.toString() / 0.8))
        expect(payment.mandate?.balance).toEqual(expectedBalance)
        await expect(mandateService.get(mandate.id)).resolves.toMatchObject({
          balance: expectedBalance
        })
      })

      it('Cancelled (insufficient mandate balance)', async (): Promise<void> => {
        const mandate = await mandateService.create({
          accountId,
          amount: invoice.amount - BigInt(1),
          assetCode: invoice.account.asset.code,
          assetScale: invoice.account.asset.scale,
          interval: 'P1M'
        })
        assert.ok(!isCreateMandateError(mandate))

        const { id: paymentId } = await paymentFactory.build({
          mandateId: mandate.id,
          invoiceUrl
        })
        const refundSpy = jest.spyOn(mandateService, 'refund')
        const payment = await processNext(
          paymentId,
          PaymentState.Cancelled,
          LifecycleError.InsufficientMandate
        )
        // Cancelling for insufficient mandate doesn't attempt to refund mandate
        // because the mandate is not charged. (It also avoids a deadlock)
        expect(refundSpy).not.toHaveBeenCalled()
        expect(payment.mandate?.balance).toEqual(mandate.balance)
        await expect(mandateService.get(mandate.id)).resolves.toEqual(mandate)
      })

      it('Quoting (rate service error)', async (): Promise<void> => {
        const mockFn = jest
          .spyOn(ratesService, 'prices')
          .mockImplementation(() => Promise.reject(new Error('fail')))
        const paymentId = (
          await paymentFactory.build({
            accountId,
            paymentPointer,
            amountToSend: BigInt(123)
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

      // This mocks Quoting→Funding, but for it to trigger for real, it would go from Sending→Quoting(retry)→Funding (when the sending partially failed).
      it('Funding (FixedSend, 0<intent.amountToSend<amountSent)', async (): Promise<void> => {
        const payment = await paymentFactory.build({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123)
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

      // These mock Quoting→Sending, but for it to trigger for real, it would go from Sending→Quoting(retry)→Sending (when the original leftover amount was never withdrawn).
      it('Sending (FixedSend, intent.amountToSend <= balance)', async (): Promise<void> => {
        const { id: paymentId } = await paymentFactory.build({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123)
        })
        const spy = jest
          .spyOn(accountingService, 'getBalance')
          .mockResolvedValueOnce(BigInt(123))
        await processNext(paymentId, PaymentState.Sending)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(paymentId)
      })

      it('Sending (FixedDelivery, quote.maxSourceAmount <= balance)', async (): Promise<void> => {
        const { id: paymentId } = await paymentFactory.build({
          accountId,
          invoiceUrl
        })
        const spy = jest
          .spyOn(accountingService, 'getBalance')
          .mockResolvedValueOnce(BigInt(123))
        await processNext(paymentId, PaymentState.Sending)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(paymentId)
      })

      // This mocks Quoting→Completed, but for it to trigger for real, it would go from Sending→Quoting(retry)→Completed (when the Sending→Completed transition failed to commit).
      it('Completed (FixedSend, intent.amountToSend===amountSent)', async (): Promise<void> => {
        const payment = await paymentFactory.build({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123)
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
          await paymentFactory.build({
            accountId,
            invoiceUrl
          })
        ).id
        await payInvoice(invoice.amount)
        await processNext(paymentId, PaymentState.Completed)
      })

      it('Cancelled (destination asset changed)', async (): Promise<void> => {
        const originalPayment = await paymentFactory.build({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123)
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

    describe('Funding→', (): void => {
      let payment: OutgoingPayment

      beforeEach(
        async (): Promise<void> => {
          const mandate = await mandateService.create({
            accountId,
            amount: invoice.amount,
            assetCode: invoice.account.asset.code,
            assetScale: invoice.account.asset.scale
          })
          assert.ok(!isCreateMandateError(mandate))

          const { id: paymentId } = await paymentFactory.build({
            invoiceUrl,
            mandateId: mandate.id
          })
          payment = await processNext(paymentId, PaymentState.Funding)
        }
      )

      it('Cancelled (quote expired)', async (): Promise<void> => {
        // nock doesn't work with 'modern' fake timers
        // https://github.com/nock/nock/issues/2200
        // jest.useFakeTimers('modern')
        // jest.advanceTimersByTime(config.quoteLifespan + 1)

        await payment.$query(knex).patch({
          quote: Object.assign({}, payment.quote, {
            activationDeadline: new Date(Date.now() - config.quoteLifespan - 1)
          })
        })

        const refundSpy = jest.spyOn(mandateService, 'refund')
        await processNext(
          payment.id,
          PaymentState.Cancelled,
          LifecycleError.QuoteExpired
        )

        assert.ok(payment.mandate && payment.quote)
        expect(refundSpy).toHaveBeenCalledTimes(1)
        expect(refundSpy).toHaveBeenCalledWith(
          payment.mandate.id,
          payment.quote.minDeliveryAmount,
          expect.anything()
        )
        await expect(
          mandateService.get(payment.mandate.id)
        ).resolves.toMatchObject({
          balance: payment.mandate.amount
        })
      })

      it('Funding (waiting to send)', async (): Promise<void> => {
        await expect(
          outgoingPaymentService.processNext()
        ).resolves.toBeUndefined()
        const after = await outgoingPaymentService.get(payment.id)
        expect(after?.state).toBe(PaymentState.Funding)
      })
    })

    describe('Sending→', (): void => {
      beforeEach(
        async (): Promise<void> => {
          // Don't send invoice.paid webhook events
          const invoiceService = await deps.use('invoiceService')
          jest
            .spyOn(invoiceService, 'handlePayment')
            .mockImplementation(() => Promise.resolve())
        }
      )

      async function setup(
        opts: PaymentIntent,
        mandateId?: string
      ): Promise<string> {
        let options: CreateOutgoingPaymentOptions
        if (mandateId) {
          assert.ok(opts.invoiceUrl)
          options = {
            mandateId,
            ...opts
          }
        } else {
          options = {
            accountId,
            ...opts
          }
        }
        const { id: paymentId } = await paymentFactory.build(options)

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

      it('Completed (FixedSend)', async (): Promise<void> => {
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

      it('Completed (FixedDelivery)', async (): Promise<void> => {
        const paymentId = await setup({
          invoiceUrl
        })

        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        const amountSent = invoice.amount * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount - amountSent,
          amountSent,
          amountDelivered: invoice.amount,
          invoiceReceived: invoice.amount
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
        const amountSent = (invoice.amount - amountAlreadyDelivered) * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount - amountSent,
          amountSent,
          amountDelivered: invoice.amount - amountAlreadyDelivered,
          invoiceReceived: invoice.amount
        })
      })

      it('Completed (mandate charge)', async (): Promise<void> => {
        const mandate = await mandateService.create({
          accountId,
          amount: invoice.amount,
          assetCode: invoice.account.asset.code,
          assetScale: invoice.account.asset.scale
        })
        assert.ok(!isCreateMandateError(mandate))
        const paymentId = await setup(
          {
            invoiceUrl
          },
          mandate.id
        )
        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        const amountSent = invoice.amount * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount - amountSent,
          amountSent,
          amountDelivered: invoice.amount,
          invoiceReceived: invoice.amount
        })
        const expectedBalance = mandate.balance - invoice.amount
        expect(payment.mandate?.balance).toEqual(expectedBalance)
        await expect(mandateService.get(mandate.id)).resolves.toMatchObject({
          balance: expectedBalance
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
          accountBalance: BigInt(123 - 10 * 5),
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
          accountBalance: BigInt(123 - 10),
          amountSent: BigInt(10),
          amountDelivered: BigInt(5)
        })
      })

      it.each`
        assetCode | refundAmount   | balanceDiff   | description
        ${'USD'}  | ${BigInt(104)} | ${BigInt(10)} | ${'source asset'}
        ${'XRP'}  | ${BigInt(51)}  | ${BigInt(5)}  | ${'destination asset'}
        ${'EUR'}  | ${BigInt(130)} | ${BigInt(12)} | ${'arbitrary asset'}
      `(
        'Cancelled (mandate charge refunded, $description)',
        async ({ assetCode, refundAmount, balanceDiff }): Promise<void> => {
          const mandate = await mandateService.create({
            accountId,
            amount: BigInt(200),
            assetCode,
            assetScale: asset.scale
          })
          assert.ok(!isCreateMandateError(mandate))
          const paymentId = await setup(
            {
              invoiceUrl
            },
            mandate.id
          )
          mockPay(
            {
              maxSourceAmount: BigInt(10),
              minDeliveryAmount: BigInt(5)
            },
            Pay.PaymentError.ReceiverProtocolViolation
          )
          const refundSpy = jest.spyOn(mandateService, 'refund')
          const payment = await processNext(
            paymentId,
            PaymentState.Cancelled,
            Pay.PaymentError.ReceiverProtocolViolation
          )
          if (!payment.quote) throw 'no quote'
          await expectOutcome(payment, {
            accountBalance: payment.quote.maxSourceAmount - BigInt(10),
            amountSent: BigInt(10),
            amountDelivered: BigInt(5)
          })
          if (assetCode === asset.code) {
            expect(refundAmount).toEqual(
              payment.quote.maxSourceAmount - BigInt(10)
            )
          } else if (assetCode === invoice.account.asset.code) {
            expect(refundAmount).toEqual(
              payment.quote.minDeliveryAmount - BigInt(5)
            )
          } else {
            expect(refundAmount).toEqual(
              BigInt(
                Math.floor(
                  (+payment.quote.maxSourceAmount.toString() - 10) / 0.8
                )
              )
            )
            expect(balanceDiff).toEqual(BigInt(Math.floor(10 / 0.8)))
          }
          expect(refundSpy).toHaveBeenCalledTimes(1)
          expect(refundSpy).toHaveBeenCalledWith(
            mandate.id,
            refundAmount,
            expect.anything()
          )
          const expectedBalance = mandate.balance - balanceDiff
          expect(payment.mandate?.balance).toEqual(expectedBalance)
          await expect(mandateService.get(mandate.id)).resolves.toMatchObject({
            balance: expectedBalance
          })
        }
      )

      it('Cancelled (mandate charge past refund deadline)', async (): Promise<void> => {
        const mandate = await mandateService.create({
          accountId,
          amount: invoice.amount,
          assetCode: invoice.account.asset.code,
          assetScale: invoice.account.asset.scale,
          interval: 'P1M'
        })
        assert.ok(!isCreateMandateError(mandate))
        const paymentId = await setup(
          {
            invoiceUrl
          },
          mandate.id
        )
        mockPay(
          {
            maxSourceAmount: BigInt(10),
            minDeliveryAmount: BigInt(5)
          },
          Pay.PaymentError.ReceiverProtocolViolation
        )
        const refundSpy = jest.spyOn(mandateService, 'refund')
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({ mandateRefundDeadline: new Date() })
        const payment = await processNext(
          paymentId,
          PaymentState.Cancelled,
          Pay.PaymentError.ReceiverProtocolViolation
        )
        if (!payment.quote) throw 'no quote'
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount - BigInt(10),
          amountSent: BigInt(10),
          amountDelivered: BigInt(5)
        })
        expect(refundSpy).not.toHaveBeenCalled()
        // Under normal circumstances, the mandate balance would have refilled at the start of the new interval
        const expectedBalance =
          mandate.balance - payment.quote.minDeliveryAmount
        expect(payment.mandate?.balance).toEqual(expectedBalance)
        await expect(mandateService.get(mandate.id)).resolves.toMatchObject({
          balance: expectedBalance
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
          accountBalance: BigInt(0),
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
        await payInvoice(invoice.amount)

        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount,
          amountSent: BigInt(0),
          amountDelivered: BigInt(0),
          invoiceReceived: invoice.amount
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
        payment = await paymentFactory.build({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123)
        })
      }
    )

    it('fails when no payment exists', async (): Promise<void> => {
      await expect(outgoingPaymentService.requote(uuid())).resolves.toEqual(
        OutgoingPaymentError.UnknownPayment
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
        ).resolves.toEqual(OutgoingPaymentError.WrongState)

        const after = await outgoingPaymentService.get(payment.id)
        expect(after?.state).toBe(startState)
        expect(after?.error).toBe('Fail')
      })
    })
  })

  describe('fund', (): void => {
    let payment: OutgoingPayment
    let quoteAmount: bigint
    beforeEach(async (): Promise<void> => {
      const { id: paymentId } = await paymentFactory.build({
        accountId,
        paymentPointer,
        amountToSend: BigInt(123)
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
      ).resolves.toEqual(OutgoingPaymentError.UnknownPayment)
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

    it('keeps Funding state after partial funding', async (): Promise<void> => {
      await expect(
        outgoingPaymentService.fund({
          id: payment.id,
          amount: quoteAmount - BigInt(1),
          transferId: uuid()
        })
      ).resolves.toMatchObject({
        id: payment.id,
        state: PaymentState.Funding
      })

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Funding)
      await expectOutcome(payment, { accountBalance: quoteAmount - BigInt(1) })
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
        ).resolves.toEqual(OutgoingPaymentError.WrongState)

        const after = await outgoingPaymentService.get(payment.id)
        expect(after?.state).toBe(startState)
      })
    })
  })

  describe('cancel', (): void => {
    it('fails when no payment exists', async (): Promise<void> => {
      await expect(outgoingPaymentService.cancel(uuid())).resolves.toEqual(
        OutgoingPaymentError.UnknownPayment
      )
    })

    it('cancels a Funding payment', async (): Promise<void> => {
      const payment = await paymentFactory.build({
        accountId,
        paymentPointer,
        amountToSend: BigInt(123)
      })
      await payment.$query().patch({ state: PaymentState.Funding })
      const scope = mockWebhookServer(payment.id, PaymentState.Cancelled)
      assert.ok(scope)
      await expect(
        outgoingPaymentService.cancel(payment.id)
      ).resolves.toMatchObject({
        id: payment.id,
        state: PaymentState.Cancelled
      })
      expect(scope.isDone()).toBe(true)

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Cancelled)
      expect(after?.error).toBe('CancelledByAPI')
    })

    it.each`
      assetCode | refundAmount   | description
      ${'USD'}  | ${BigInt(114)} | ${'source asset'}
      ${'XRP'}  | ${BigInt(56)}  | ${'destination asset'}
      ${'EUR'}  | ${BigInt(142)} | ${'arbitrary asset'}
    `(
      'refunds $description mandate charge',
      async ({ assetCode, refundAmount }): Promise<void> => {
        const mandate = await mandateService.create({
          accountId,
          amount: BigInt(200),
          assetCode,
          assetScale: asset.scale
        })
        assert.ok(!isCreateMandateError(mandate))
        const payment = await paymentFactory.build({
          mandateId: mandate.id,
          invoiceUrl
        })
        await processNext(payment.id, PaymentState.Funding)

        const refundSpy = jest.spyOn(mandateService, 'refund')
        const scope = mockWebhookServer(payment.id, PaymentState.Cancelled)
        assert.ok(scope)
        await expect(
          outgoingPaymentService.cancel(payment.id)
        ).resolves.toMatchObject({
          id: payment.id,
          state: PaymentState.Cancelled,
          error: LifecycleError.CancelledByAPI,
          mandate: {
            balance: mandate.amount
          }
        })
        expect(scope.isDone()).toBe(true)
        expect(refundSpy).toHaveBeenCalledTimes(1)
        expect(refundSpy).toHaveBeenCalledWith(
          mandate.id,
          refundAmount,
          expect.anything()
        )
        await expect(mandateService.get(mandate.id)).resolves.toMatchObject({
          balance: mandate.amount
        })
      }
    )

    it("doesn't refund mandate past deadline", async (): Promise<void> => {
      const mandate = await mandateService.create({
        accountId,
        amount: BigInt(200),
        assetCode: invoice.account.asset.code,
        assetScale: asset.scale,
        interval: 'P1M'
      })
      assert.ok(!isCreateMandateError(mandate))
      const { id: paymentId } = await paymentFactory.build({
        mandateId: mandate.id,
        invoiceUrl
      })
      const payment = await processNext(paymentId, PaymentState.Funding)
      if (!payment.mandate) throw 'no mandate'
      await payment.$query(knex).patch({ mandateRefundDeadline: new Date() })

      const refundSpy = jest.spyOn(mandateService, 'refund')
      const scope = mockWebhookServer(payment.id, PaymentState.Cancelled)
      assert.ok(scope)
      await expect(
        outgoingPaymentService.cancel(payment.id)
      ).resolves.toMatchObject({
        id: payment.id,
        state: PaymentState.Cancelled,
        error: LifecycleError.CancelledByAPI,
        mandate: {
          balance: payment.mandate.balance
        }
      })
      expect(scope.isDone()).toBe(true)
      expect(refundSpy).toHaveBeenCalledTimes(0)
      // Under normal circumstances, the mandate balance would have refilled at the start of the new interval
      await expect(mandateService.get(mandate.id)).resolves.toMatchObject({
        balance: payment.mandate.balance
      })
    })

    Object.values(PaymentState).forEach((startState) => {
      if (startState === PaymentState.Funding) return
      it(`does not cancel a ${startState} payment`, async (): Promise<void> => {
        const payment = await paymentFactory.build({
          accountId,
          paymentPointer,
          amountToSend: BigInt(123)
        })
        await payment.$query().patch({ state: startState })
        await expect(
          outgoingPaymentService.cancel(payment.id)
        ).resolves.toEqual(OutgoingPaymentError.WrongState)

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
          await paymentFactory.build({
            accountId,
            paymentPointer,
            amountToSend: BigInt(123)
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
