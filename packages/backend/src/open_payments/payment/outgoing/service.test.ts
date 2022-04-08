import assert from 'assert'
import nock, { Definition } from 'nock'
import Knex from 'knex'
import * as Pay from '@interledger/pay'
import { URL } from 'url'
import { v4 as uuid } from 'uuid'

import {
  FundingError,
  LifecycleError,
  OutgoingPaymentError,
  isOutgoingPaymentError
} from './errors'
import { OutgoingPaymentService, CreateOutgoingPaymentOptions } from './service'
import { createTestApp, TestContainer } from '../../../tests/app'
import { IAppConfig, Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../../'
import { AppServices } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import {
  OutgoingPayment,
  PaymentAmount,
  OutgoingPaymentState,
  PaymentEvent,
  PaymentEventType
} from './model'
import { RETRY_BACKOFF_SECONDS } from './worker'
import { isTransferError } from '../../../accounting/errors'
import { AccountingService, TransferOptions } from '../../../accounting/service'
import { AssetOptions } from '../../../asset/service'
import { IncomingPayment } from '../incoming/model'
import { RatesService } from '../../../rates/service'
import { Pagination } from '../../../shared/baseModel'
import { getPageTests } from '../../../shared/baseModel.test'
import { isIncomingPaymentError } from '../incoming/errors'
import { IncomingPaymentRoutes } from '../incoming/routes'
import { createContext } from '../../../tests/context'

describe('OutgoingPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let outgoingPaymentService: OutgoingPaymentService
  let ratesService: RatesService
  let accountingService: AccountingService
  let knex: Knex
  let accountId: string
  let incomingPayment: IncomingPayment
  let receivingPayment: string
  let accountUrl: string
  let receivingAccount: string
  let amtDelivered: bigint
  let config: IAppConfig
  let incomingPaymentRoutes: IncomingPaymentRoutes

  const asset: AssetOptions = {
    scale: 9,
    code: 'USD'
  }

  const sendAmount = {
    amount: BigInt(123),
    assetCode: asset.code,
    assetScale: asset.scale
  }

  const destinationAsset = {
    scale: 9,
    code: 'XRP'
  }

  const receiveAmount = {
    amount: BigInt(56),
    assetCode: destinationAsset.code,
    assetScale: destinationAsset.scale
  }

  const webhookTypes: {
    [key in OutgoingPaymentState]: PaymentEventType | undefined
  } = {
    [OutgoingPaymentState.Pending]: undefined,
    [OutgoingPaymentState.Funding]: PaymentEventType.PaymentFunding,
    [OutgoingPaymentState.Sending]: undefined,
    [OutgoingPaymentState.Failed]: PaymentEventType.PaymentFailed,
    [OutgoingPaymentState.Completed]: PaymentEventType.PaymentCompleted
  }

  async function createPayment(
    options: CreateOutgoingPaymentOptions
  ): Promise<OutgoingPayment> {
    const payment = await outgoingPaymentService.create(options)
    assert.ok(!isOutgoingPaymentError(payment))
    return payment
  }

  async function processNext(
    paymentId: string,
    expectState: OutgoingPaymentState,
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

  function mockCreateIncomingPayment(
    receiveAmount?: PaymentAmount
  ): nock.Scope {
    const incomingPaymentsUrl = new URL(`${accountUrl}/incoming-payments`)
    return (
      nock(incomingPaymentsUrl.origin)
        .post(incomingPaymentsUrl.pathname, function (this: Definition, body) {
          expect(body.incomingAmount).toEqual(
            receiveAmount
              ? {
                  amount: receiveAmount.amount.toString(),
                  assetCode: receiveAmount.assetCode,
                  assetScale: receiveAmount.assetScale
                }
              : undefined
          )
          return true
        })
        .matchHeader('Accept', 'application/json')
        // TODO:
        // .matchHeader('Content-Type', 'application/json')
        // .reply(201, function (path, requestBody) {
        //   return Axios.post(`http://localhost:${appContainer.port}${path}`, requestBody, {
        //     headers: this.req.headers
        //   }).then((res) => res.data)
        // })
        .reply(201, function (path, requestBody: string) {
          const ctx = createContext(
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              }
            },
            { accountId: incomingPayment.accountId }
          )
          ctx.request.body = JSON.parse(requestBody)
          return incomingPaymentRoutes.create(ctx).then(() => ctx.body)
        })
    )
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

      knex = await deps.use('knex')
      config = await deps.use('config')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      incomingPaymentRoutes = await deps.use('incomingPaymentRoutes')
      outgoingPaymentService = await deps.use('outgoingPaymentService')
      const accountService = await deps.use('accountService')
      accountId = (
        await accountService.create({
          asset: {
            code: sendAmount.assetCode,
            scale: sendAmount.assetScale
          }
        })
      ).id
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
      accountUrl = `${config.publicHost}/${destinationAccount.id}`
      receivingAccount = accountUrl.replace('https://', '$')
      const incomingPaymentService = await deps.use('incomingPaymentService')
      incomingPayment = (await incomingPaymentService.create({
        accountId: destinationAccount.id,
        incomingAmount: {
          amount: BigInt(56),
          assetCode: destinationAsset.code,
          assetScale: destinationAsset.scale
        },
        description: 'description!'
      })) as IncomingPayment
      assert.ok(!isIncomingPaymentError(incomingPayment))
      receivingPayment = `${accountUrl}/incoming-payments/${incomingPayment.id}`
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
    it.each`
      assetCode               | assetScale
      ${sendAmount.assetCode} | ${sendAmount.assetScale}
      ${undefined}            | ${undefined}
    `(
      'creates an OutgoingPayment to account (FixedSend)',
      async ({ assetCode, assetScale }): Promise<void> => {
        const options = {
          accountId,
          receivingAccount,
          sendAmount: {
            amount: sendAmount.amount,
            assetCode,
            assetScale
          },
          description: 'rent',
          externalRef: '202201'
        }
        const payment = await outgoingPaymentService.create(options)
        assert.ok(!isOutgoingPaymentError(payment))
        expect(payment).toMatchObject({
          ...options,
          state: OutgoingPaymentState.Pending,
          receiveAmount: null,
          receivingPayment: null,
          account: {
            asset
          }
        })
        await expectOutcome(payment, { accountBalance: BigInt(0) })

        await expect(outgoingPaymentService.get(payment.id)).resolves.toEqual(
          payment
        )
      }
    )

    it.each`
      receiveAsset
      ${destinationAsset}
      ${undefined}
    `(
      'creates an OutgoingPayment to account (FixedDelivery)',
      async ({ receiveAsset }): Promise<void> => {
        const receiveAmount: PaymentAmount = {
          amount: BigInt(56)
        }
        if (receiveAsset) {
          receiveAmount.assetCode = receiveAsset.code
          receiveAmount.assetScale = receiveAsset.scale
        }
        const options = {
          accountId,
          receivingAccount,
          receiveAmount
        }
        const payment = await outgoingPaymentService.create(options)
        assert.ok(!isOutgoingPaymentError(payment))
        expect(payment).toMatchObject({
          ...options,
          state: OutgoingPaymentState.Pending,
          sendAmount: null,
          receivingPayment: null,
          description: null,
          externalRef: null,
          account: {
            asset
          }
        })
        await expectOutcome(payment, { accountBalance: BigInt(0) })

        await expect(outgoingPaymentService.get(payment.id)).resolves.toEqual(
          payment
        )
      }
    )

    it('creates an OutgoingPayment to incoming payment (FixedDelivery)', async () => {
      const options = {
        accountId,
        receivingPayment
      }
      const payment = await outgoingPaymentService.create(options)
      assert.ok(!isOutgoingPaymentError(payment))
      expect(payment).toMatchObject({
        ...options,
        state: OutgoingPaymentState.Pending,
        receivingAccount: null,
        sendAmount: null,
        receiveAmount: null,
        description: null,
        externalRef: null,
        account: {
          asset
        }
      })

      await expectOutcome(payment, { accountBalance: BigInt(0) })

      await expect(outgoingPaymentService.get(payment.id)).resolves.toEqual(
        payment
      )
    })

    // receivingPayment and receivingAccount are defined in `beforeEach`
    // and unavailable in the `test.each` table
    test.each`
      toPayment | toAccount | sendAmount                | receiveAmount             | error                                      | description
      ${false}  | ${false}  | ${sendAmount}             | ${undefined}              | ${OutgoingPaymentError.InvalidDestination} | ${'without a destination'}
      ${true}   | ${true}   | ${sendAmount}             | ${undefined}              | ${OutgoingPaymentError.InvalidDestination} | ${'with multiple destinations'}
      ${true}   | ${false}  | ${sendAmount}             | ${undefined}              | ${OutgoingPaymentError.InvalidAmount}      | ${'with invalid sendAmount'}
      ${true}   | ${false}  | ${undefined}              | ${receiveAmount}          | ${OutgoingPaymentError.InvalidAmount}      | ${'with invalid receiveAmount'}
      ${false}  | ${true}   | ${undefined}              | ${undefined}              | ${OutgoingPaymentError.InvalidAmount}      | ${'with missing amount'}
      ${true}   | ${false}  | ${sendAmount}             | ${receiveAmount}          | ${OutgoingPaymentError.InvalidAmount}      | ${'with multiple amounts'}
      ${false}  | ${true}   | ${{ amount: BigInt(0) }}  | ${undefined}              | ${OutgoingPaymentError.InvalidAmount}      | ${'sendAmount of zero'}
      ${false}  | ${true}   | ${{ amount: BigInt(-1) }} | ${undefined}              | ${OutgoingPaymentError.InvalidAmount}      | ${'negative sendAmount'}
      ${false}  | ${true}   | ${undefined}              | ${{ amount: BigInt(0) }}  | ${OutgoingPaymentError.InvalidAmount}      | ${'receiveAmount of zero'}
      ${false}  | ${true}   | ${undefined}              | ${{ amount: BigInt(-1) }} | ${OutgoingPaymentError.InvalidAmount}      | ${'negative receiveAmount'}
    `(
      'fails to create $description',
      async ({
        toPayment,
        toAccount,
        sendAmount,
        receiveAmount,
        error
      }): Promise<void> => {
        await expect(
          outgoingPaymentService.create({
            accountId,
            receivingPayment: toPayment ? receivingPayment : undefined,
            receivingAccount: toAccount ? receivingAccount : undefined,
            sendAmount,
            receiveAmount
          })
        ).resolves.toEqual(error)
      }
    )
  })

  describe('processNext', (): void => {
    describe('PENDING→', (): void => {
      it('FUNDING (FixedSend)', async (): Promise<void> => {
        const paymentId = (
          await createPayment({
            accountId,
            receivingAccount,
            sendAmount
          })
        ).id
        const scope = mockCreateIncomingPayment()
        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Funding
        )
        scope.isDone()
        expect(payment.receivingPayment).toBeDefined()
        if (!payment.quote) throw 'no quote'

        expect(payment.quote.timestamp).toBeInstanceOf(Date)
        expect(payment.quote.targetType).toBe(Pay.PaymentType.FixedSend)
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

        expect(payment.receiveAmount).toEqual({
          amount: BigInt(
            Math.ceil(123 * payment.quote.minExchangeRate.valueOf())
          ),
          assetCode: destinationAsset.code,
          assetScale: destinationAsset.scale
        })
      })

      it('FUNDING (FixedDelivery)', async (): Promise<void> => {
        const paymentId = (
          await createPayment({
            accountId,
            receivingAccount,
            receiveAmount
          })
        ).id
        const scope = mockCreateIncomingPayment(receiveAmount)

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Funding
        )
        scope.isDone()
        expect(payment.receivingPayment).toBeDefined()
        if (!payment.quote) throw 'no quote'

        expect(payment.quote.timestamp).toBeInstanceOf(Date)
        expect(payment.quote.targetType).toBe(Pay.PaymentType.FixedDelivery)
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

        expect(payment.receiveAmount).toEqual(receiveAmount)
        if (!payment.sendAmount) throw 'no sendAmount'
        expect(payment.sendAmount).toEqual({
          amount: BigInt(Math.ceil(56 * 2 * (1 + config.slippage))),
          assetCode: payment.account.asset.code,
          assetScale: payment.account.asset.scale
        })
      })

      it('FUNDING (IncomingPayment)', async (): Promise<void> => {
        const paymentId = (
          await createPayment({
            accountId,
            receivingPayment: receivingPayment
          })
        ).id
        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Funding
        )
        expect(payment.receiveAmount).toEqual({
          amount: BigInt(56),
          assetScale: incomingPayment.asset.scale,
          assetCode: incomingPayment.asset.code
        })
        if (!payment.sendAmount) throw 'no sendAmount'
        expect(payment.sendAmount).toEqual({
          amount: BigInt(Math.ceil(56 * 2 * (1 + config.slippage))),
          assetCode: payment.account.asset.code,
          assetScale: payment.account.asset.scale
        })

        if (!payment.quote) throw 'no quote'

        expect(payment.quote.targetType).toBe(Pay.PaymentType.FixedDelivery)
        expect(payment.quote.minExchangeRate.valueOf()).toBe(
          0.5 * (1 - config.slippage)
        )
        expect(payment.quote.lowExchangeRateEstimate.valueOf()).toBe(0.5)
        expect(payment.quote.highExchangeRateEstimate.valueOf()).toBe(
          0.500000000001
        )
      })

      it('PENDING (rate service error)', async (): Promise<void> => {
        const mockFn = jest
          .spyOn(ratesService, 'prices')
          .mockImplementation(() => Promise.reject(new Error('fail')))
        const paymentId = (
          await createPayment({
            accountId,
            receivingAccount,
            sendAmount
          })
        ).id
        const scope = mockCreateIncomingPayment()
        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Pending
        )
        scope.isDone()

        expect(payment.stateAttempts).toBe(1)
        expect(payment.quote).toBeNull()

        mockFn.mockRestore()
        // Fast forward to next attempt.
        // Only mock the time once (for getPendingPayment) since otherwise ilp/pay's startQuote will get confused.
        jest
          .spyOn(Date, 'now')
          .mockReturnValueOnce(Date.now() + 1 * RETRY_BACKOFF_SECONDS * 1000)

        const payment2 = await processNext(
          paymentId,
          OutgoingPaymentState.Funding
        )
        expect(payment2.quote).toBeDefined()
      })

      // Maybe another person or payment paid the incoming payment already.
      it('FAILED (FixedDelivery, incoming payment was already full paid)', async (): Promise<void> => {
        const paymentId = (
          await createPayment({
            accountId,
            receivingPayment: receivingPayment
          })
        ).id
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await payIncomingPayment(incomingPayment.incomingAmount!.amount)
        await processNext(
          paymentId,
          OutgoingPaymentState.Failed,
          Pay.PaymentError.IncomingPaymentCompleted
        )
      })

      it('FAILED (source asset changed)', async (): Promise<void> => {
        const { id: paymentId } = await createPayment({
          accountId,
          receivingAccount,
          sendAmount
        })
        const assetService = await deps.use('assetService')
        const { id: assetId } = await assetService.getOrCreate({
          code: asset.code,
          scale: asset.scale + 1
        })
        await OutgoingPayment.relatedQuery('account').for(paymentId).patch({
          assetId
        })

        const scope = mockCreateIncomingPayment()
        await processNext(
          paymentId,
          OutgoingPaymentState.Failed,
          LifecycleError.SourceAssetConflict
        )
        scope.isDone()
      })
    })

    describe('SENDING→', (): void => {
      async function setup(
        opts: Pick<
          CreateOutgoingPaymentOptions,
          | 'sendAmount'
          | 'receivingAccount'
          | 'receivingPayment'
          | 'receiveAmount'
        >
      ): Promise<string> {
        const { id: paymentId } = await createPayment({
          accountId,
          ...opts
        })

        trackAmountDelivered(paymentId)

        const scope =
          opts.receivingAccount && mockCreateIncomingPayment(opts.receiveAmount)
        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Funding
        )
        if (opts.receivingAccount) {
          ;(scope as nock.Scope).isDone()
        }
        assert.ok(payment.sendAmount)
        await expect(
          outgoingPaymentService.fund({
            id: paymentId,
            amount: payment.sendAmount.amount,
            transferId: uuid()
          })
        ).resolves.toMatchObject({
          state: OutgoingPaymentState.Sending
        })

        return paymentId
      }

      it('COMPLETED (FixedSend)', async (): Promise<void> => {
        const paymentId = await setup({
          receivingAccount,
          sendAmount
        })

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        await expectOutcome(payment, {
          accountBalance: BigInt(0),
          amountSent: BigInt(123),
          amountDelivered: BigInt(Math.floor(123 / 2))
        })
      })

      it('COMPLETED (FixedDelivery)', async (): Promise<void> => {
        const paymentId = await setup({
          receivingAccount,
          receiveAmount
        })

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        if (!payment.sendAmount) throw 'no sendAmount'
        const amountSent = receiveAmount.amount * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.sendAmount.amount - amountSent,
          amountSent,
          amountDelivered: receiveAmount.amount,
          withdrawAmount: payment.sendAmount.amount - amountSent
        })
      })

      it('COMPLETED (IncomingPayment)', async (): Promise<void> => {
        const paymentId = await setup({
          receivingPayment: receivingPayment
        })

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        if (!payment.sendAmount) throw 'no sendAmount'
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const amountSent = incomingPayment.incomingAmount!.amount * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.sendAmount.amount - amountSent,
          amountSent,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          amountDelivered: incomingPayment.incomingAmount!.amount,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          incomingPaymentReceived: incomingPayment.incomingAmount!.amount,
          withdrawAmount: payment.sendAmount.amount - amountSent
        })
      })

      it('COMPLETED (FixedDelivery, with incoming payment initially partially paid)', async (): Promise<void> => {
        const amountAlreadyDelivered = BigInt(34)
        await payIncomingPayment(amountAlreadyDelivered)
        const paymentId = await setup({
          receivingPayment: receivingPayment
        })

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        if (!payment.sendAmount) throw 'no sendAmount'
        const amountSent =
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (incomingPayment.incomingAmount!.amount - amountAlreadyDelivered) *
          BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.sendAmount.amount - amountSent,
          amountSent,
          amountDelivered:
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            incomingPayment.incomingAmount!.amount - amountAlreadyDelivered,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          incomingPaymentReceived: incomingPayment.incomingAmount!.amount,
          withdrawAmount: payment.sendAmount.amount - amountSent
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
          receivingAccount,
          sendAmount
        })

        for (let i = 0; i < 4; i++) {
          const payment = await processNext(
            paymentId,
            OutgoingPaymentState.Sending
          )
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
          OutgoingPaymentState.Failed,
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

      it('FAILED (non-retryable Pay error)', async (): Promise<void> => {
        mockPay(
          {
            maxSourceAmount: BigInt(10),
            minDeliveryAmount: BigInt(5)
          },
          Pay.PaymentError.ReceiverProtocolViolation
        )
        const paymentId = await setup({
          receivingAccount,
          sendAmount
        })

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Failed,
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
        const paymentId = await setup({
          receivingAccount,
          sendAmount
        })

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Sending
        )
        mockFn.mockRestore()
        fastForwardToAttempt(1)
        await expectOutcome(payment, {
          accountBalance: BigInt(123 - 10),
          amountSent: BigInt(10),
          amountDelivered: BigInt(5)
        })

        // The next attempt is without the mock, so it succeeds.
        const payment2 = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        await expectOutcome(payment2, {
          accountBalance: BigInt(0),
          amountSent: sendAmount.amount,
          amountDelivered: sendAmount.amount / BigInt(2)
        })
      })

      // Caused by retry after failed SENDING→COMPLETED transition commit.
      it('COMPLETED (FixedSend, already fully paid)', async (): Promise<void> => {
        const paymentId = await setup({
          receivingAccount,
          sendAmount
        })

        await processNext(paymentId, OutgoingPaymentState.Completed)
        // Pretend that the transaction didn't commit.
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({ state: OutgoingPaymentState.Sending })
        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        await expectOutcome(payment, {
          accountBalance: BigInt(0),
          amountSent: BigInt(123),
          amountDelivered: BigInt(123) / BigInt(2)
        })
      })

      // Caused by retry after failed SENDING→COMPLETED transition commit.
      it('COMPLETED (FixedDelivery, already fully paid)', async (): Promise<void> => {
        const paymentId = await setup({
          receivingPayment: receivingPayment
        })
        // The quote thinks there's a full amount to pay, but actually sending will find the incoming payment has been paid (e.g. by another payment).
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await payIncomingPayment(incomingPayment.incomingAmount!.amount)

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        if (!payment.sendAmount) throw 'no sendAmount'
        await expectOutcome(payment, {
          accountBalance: payment.sendAmount.amount,
          amountSent: BigInt(0),
          amountDelivered: BigInt(0),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          incomingPaymentReceived: incomingPayment.incomingAmount!.amount,
          withdrawAmount: payment.sendAmount.amount
        })
      })

      it('FAILED (source asset changed)', async (): Promise<void> => {
        const paymentId = await setup({
          receivingPayment: receivingPayment
        })
        const assetService = await deps.use('assetService')
        const { id: assetId } = await assetService.getOrCreate({
          code: asset.code,
          scale: asset.scale + 1
        })
        await OutgoingPayment.relatedQuery('account').for(paymentId).patch({
          assetId
        })

        await processNext(
          paymentId,
          OutgoingPaymentState.Failed,
          LifecycleError.SourceAssetConflict
        )
      })

      it('FAILED (destination asset changed)', async (): Promise<void> => {
        const paymentId = await setup({
          receivingPayment: receivingPayment
        })
        // Pretend that the destination asset was initially different.
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({
            receiveAmount: {
              amount: BigInt(56),
              assetCode: incomingPayment.asset.code,
              assetScale: 55
            }
          })

        await processNext(
          paymentId,
          OutgoingPaymentState.Failed,
          Pay.PaymentError.DestinationAssetConflict
        )
      })
    })
  })

  describe('fund', (): void => {
    let payment: OutgoingPayment
    let quoteAmount: bigint

    beforeEach(async (): Promise<void> => {
      const { id: paymentId } = await createPayment({
        accountId,
        receivingAccount,
        sendAmount
      })
      const scope = mockCreateIncomingPayment()
      payment = await processNext(paymentId, OutgoingPaymentState.Funding)
      scope.isDone()
      assert.ok(payment.sendAmount)
      quoteAmount = payment.sendAmount.amount
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
        state: OutgoingPaymentState.Sending
      })

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(OutgoingPaymentState.Sending)
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
      expect(after?.state).toBe(OutgoingPaymentState.Funding)
      await expectOutcome(payment, { accountBalance: BigInt(0) })
    })

    Object.values(OutgoingPaymentState).forEach((startState) => {
      if (startState === OutgoingPaymentState.Funding) return
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
        createPayment({
          accountId,
          receivingAccount,
          sendAmount
        }),
      getPage: (pagination: Pagination) =>
        outgoingPaymentService.getAccountPage(accountId, pagination)
    })
  })
})
