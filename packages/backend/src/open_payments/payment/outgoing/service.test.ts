import assert from 'assert'
import nock from 'nock'
import { Knex } from 'knex'
import * as Pay from '@interledger/pay'
import { v4 as uuid } from 'uuid'

import {
  FundingError,
  LifecycleError,
  OutgoingPaymentError,
  isOutgoingPaymentError
} from './errors'
import { CreateOutgoingPaymentOptions, OutgoingPaymentService } from './service'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config } from '../../../config/app'
import { CreateQuoteOptions } from '../../quote/service'
import { createGrant } from '../../../tests/grant'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createOutgoingPayment } from '../../../tests/outgoingPayment'
import {
  createPaymentPointer,
  MockPaymentPointer
} from '../../../tests/paymentPointer'
import { PeerFactory } from '../../../tests/peerFactory'
import { createQuote } from '../../../tests/quote'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../../'
import { AppServices } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import {
  OutgoingPayment,
  OutgoingPaymentGrant,
  OutgoingPaymentState,
  PaymentData,
  PaymentEvent,
  PaymentEventType
} from './model'
import { RETRY_BACKOFF_SECONDS } from './worker'
import { IncomingPayment, IncomingPaymentState } from '../incoming/model'
import { isTransferError, TransferError } from '../../../accounting/errors'
import { AccountingService, TransferOptions } from '../../../accounting/service'
import { AssetOptions } from '../../../asset/service'
import { Amount } from '../../amount'
import { ConnectionService } from '../../connection/service'
import { getTests } from '../../payment_pointer/model.test'
import { AccessAction, AccessType, Grant } from '../../auth/grant'
import { GrantReference } from '../../grantReference/model'
import { Quote } from '../../quote/model'
import { GrantReferenceService } from '../../grantReference/service'

describe('OutgoingPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let outgoingPaymentService: OutgoingPaymentService
  let accountingService: AccountingService
  let connectionService: ConnectionService
  let knex: Knex
  let paymentPointerId: string
  let incomingPayment: IncomingPayment
  let receiverPaymentPointer: MockPaymentPointer
  let receiver: string
  let amtDelivered: bigint
  let trx: Knex.Transaction
  let grantReferenceService: GrantReferenceService
  let grantRef: GrantReference

  const asset: AssetOptions = {
    scale: 9,
    code: 'USD'
  }

  const sendAmount: Amount = {
    value: BigInt(123),
    assetCode: asset.code,
    assetScale: asset.scale
  }

  const destinationAsset = {
    scale: 9,
    code: 'XRP'
  }

  const webhookTypes: {
    [key in OutgoingPaymentState]: PaymentEventType | undefined
  } = {
    [OutgoingPaymentState.Funding]: PaymentEventType.PaymentCreated,
    [OutgoingPaymentState.Sending]: undefined,
    [OutgoingPaymentState.Failed]: PaymentEventType.PaymentFailed,
    [OutgoingPaymentState.Completed]: PaymentEventType.PaymentCompleted
  }

  async function processNext(
    paymentId: string,
    expectState: OutgoingPaymentState,
    expectedError?: string
  ): Promise<OutgoingPayment> {
    await expect(outgoingPaymentService.processNext()).resolves.toBe(paymentId)
    const payment = await outgoingPaymentService.get({
      id: paymentId
    })
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
    await incomingPayment.onCredit({
      totalReceived: await accountingService.getTotalReceived(
        incomingPayment.id
      )
    })
  }

  function trackAmountDelivered(sourcePaymentPointerId: string): void {
    const { createTransfer } = accountingService
    jest
      .spyOn(accountingService, 'createTransfer')
      .mockImplementation(async (options: TransferOptions) => {
        const trxOrError = await createTransfer(options)
        if (
          !isTransferError(trxOrError) &&
          options.sourceAccount.id === sourcePaymentPointerId
        ) {
          return {
            commit: async (): Promise<void | TransferError> => {
              const err = await trxOrError.commit()
              if (!err) {
                amtDelivered +=
                  options.destinationAmount || options.sourceAmount
              }
              return err
            },
            rollback: trxOrError.rollback
          }
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
      expect(payment.sentAmount.value).toEqual(amountSent)
      await expect(accountingService.getTotalSent(payment.id)).resolves.toBe(
        payment.sentAmount.value
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

  beforeAll(async (): Promise<void> => {
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
    outgoingPaymentService = await deps.use('outgoingPaymentService')
    accountingService = await deps.use('accountingService')
    connectionService = await deps.use('connectionService')
    grantReferenceService = await deps.use('grantReferenceService')
    knex = await deps.use('knex')
  })

  beforeEach(async (): Promise<void> => {
    paymentPointerId = (
      await createPaymentPointer(deps, {
        asset: {
          code: sendAmount.assetCode,
          scale: sendAmount.assetScale
        }
      })
    ).id
    receiverPaymentPointer = await createPaymentPointer(deps, {
      asset: destinationAsset,
      mockServerPort: appContainer.openPaymentsPort
    })
    await expect(
      accountingService.createDeposit({
        id: uuid(),
        account: receiverPaymentPointer.asset,
        amount: BigInt(123)
      })
    ).resolves.toBeUndefined()

    grantRef = await grantReferenceService.create({
      id: uuid(),
      clientId: appContainer.clientId
    })
    incomingPayment = await createIncomingPayment(deps, {
      paymentPointerId: receiverPaymentPointer.id,
      grantId: grantRef.id
    })
    receiver = incomingPayment.url

    amtDelivered = BigInt(0)
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    receiverPaymentPointer.scope?.persist(false)
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get/getPaymentPointerPage', (): void => {
    getTests({
      createGrant: async ({ clientId }) =>
        createGrant(deps, {
          clientId,
          access: [
            {
              type: AccessType.OutgoingPayment,
              actions: [AccessAction.Create, AccessAction.Read]
            }
          ]
        }),
      createModel: ({ grant }: { grant?: Grant }) =>
        createOutgoingPayment(deps, {
          paymentPointerId,
          grant,
          receiver,
          sendAmount,
          validDestination: false
        }),
      get: (options) => outgoingPaymentService.get(options),
      list: (options) => outgoingPaymentService.getPaymentPointerPage(options)
    })
  })

  describe('create', (): void => {
    describe.each`
      existingGrant | description
      ${true}       | ${'existing grant'}
      ${false}      | ${'new grant'}
    `('$description', ({ existingGrant }): void => {
      beforeEach(async (): Promise<void> => {
        if (existingGrant) {
          await OutgoingPaymentGrant.query(knex).insertAndFetch({
            id: grantRef.id
          })
        }
      })

      describe.each`
        toConnection | description
        ${true}      | ${'connection receiver'}
        ${false}     | ${'incoming payment receiver'}
      `('$description', ({ toConnection }): void => {
        it.each`
          outgoingPeer | description
          ${false}     | ${''}
          ${true}      | ${'with an outgoing peer'}
        `(
          'creates an OutgoingPayment from a quote $description',
          async ({ outgoingPeer }): Promise<void> => {
            const peerService = await deps.use('peerService')
            const peerFactory = new PeerFactory(peerService)
            const peer = await peerFactory.build()
            if (toConnection) {
              receiver = connectionService.getUrl(incomingPayment)
            }
            const quote = await createQuote(deps, {
              paymentPointerId,
              receiver,
              sendAmount
            })
            const options = {
              paymentPointerId,
              quoteId: quote.id,
              description: 'rent',
              externalRef: '202201'
            }
            if (outgoingPeer) {
              jest
                .spyOn(peerService, 'getByDestinationAddress')
                .mockResolvedValueOnce(peer)
            }
            const payment = await outgoingPaymentService.create(options)
            assert.ok(!isOutgoingPaymentError(payment))
            expect(payment).toMatchObject({
              id: quote.id,
              paymentPointerId,
              receiver: quote.receiver,
              sendAmount: quote.sendAmount,
              receiveAmount: quote.receiveAmount,
              description: options.description,
              externalRef: options.externalRef,
              state: OutgoingPaymentState.Funding,
              asset,
              quote,
              peerId: outgoingPeer ? peer.id : null
            })

            await expect(
              outgoingPaymentService.get({
                id: payment.id
              })
            ).resolves.toEqual(payment)

            const expectedPaymentData: Partial<PaymentData['payment']> = {
              id: payment.id
            }
            if (outgoingPeer) {
              expectedPaymentData.peerId = peer.id
            }
            await expect(
              PaymentEvent.query(knex).where({
                type: PaymentEventType.PaymentCreated
              })
            ).resolves.toMatchObject([
              {
                data: {
                  payment: expectedPaymentData
                }
              }
            ])
          }
        )
      })

      it('fails to create on unknown payment pointer', async () => {
        const { id: quoteId } = await createQuote(deps, {
          paymentPointerId,
          receiver,
          sendAmount,
          validDestination: false
        })
        await expect(
          outgoingPaymentService.create({
            paymentPointerId: uuid(),
            quoteId
          })
        ).resolves.toEqual(OutgoingPaymentError.UnknownPaymentPointer)
      })

      it('fails to create on unknown quote', async () => {
        await expect(
          outgoingPaymentService.create({
            paymentPointerId,
            quoteId: uuid()
          })
        ).resolves.toEqual(OutgoingPaymentError.UnknownQuote)
      })

      it('fails to create on "consumed" quote', async () => {
        const { quote } = await createOutgoingPayment(deps, {
          paymentPointerId,
          receiver,
          validDestination: false
        })
        await expect(
          outgoingPaymentService.create({
            paymentPointerId,
            quoteId: quote.id
          })
        ).resolves.toEqual(OutgoingPaymentError.InvalidQuote)
      })

      it('fails to create on invalid quote payment pointer', async () => {
        const quote = await createQuote(deps, {
          paymentPointerId,
          receiver,
          sendAmount,
          validDestination: false
        })
        await expect(
          outgoingPaymentService.create({
            paymentPointerId: receiverPaymentPointer.id,
            quoteId: quote.id
          })
        ).resolves.toEqual(OutgoingPaymentError.InvalidQuote)
      })

      it('fails to create on expired quote', async () => {
        const quote = await createQuote(deps, {
          paymentPointerId,
          receiver,
          sendAmount,
          validDestination: false
        })
        await quote.$query(knex).patch({
          expiresAt: new Date()
        })
        await expect(
          outgoingPaymentService.create({
            paymentPointerId,
            quoteId: quote.id
          })
        ).resolves.toEqual(OutgoingPaymentError.InvalidQuote)
      })
      it.each`
        state
        ${IncomingPaymentState.Completed}
        ${IncomingPaymentState.Expired}
      `(
        `fails to create on $state quote receiver`,
        async ({ state }): Promise<void> => {
          const quote = await createQuote(deps, {
            paymentPointerId,
            receiver,
            sendAmount
          })
          await incomingPayment.$query(knex).patch({
            state,
            expiresAt:
              state === IncomingPaymentState.Expired ? new Date() : undefined
          })
          await expect(
            outgoingPaymentService.create({
              paymentPointerId,
              quoteId: quote.id
            })
          ).resolves.toEqual(OutgoingPaymentError.InvalidQuote)
        }
      )

      test('fails to create if grant is locked', async () => {
        const grant = new Grant({
          active: true,
          clientId: grantRef.clientId,
          grant: grantRef.id,
          access: [
            {
              type: AccessType.OutgoingPayment,
              actions: [AccessAction.Create, AccessAction.Read],
              limits: {
                receiver,
                sendAmount
              }
            }
          ]
        })
        const quotes = await Promise.all(
          [0, 1].map(async (_) => {
            return await createQuote(deps, {
              paymentPointerId,
              receiver,
              sendAmount
            })
          })
        )
        const options = quotes.map((quote) => {
          return {
            paymentPointerId,
            quoteId: quote.id,
            description: 'rent',
            externalRef: '202201',
            grant,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            callback: (f: any) => setTimeout(f, 5000)
          }
        })

        if (existingGrant) {
          await expect(
            Promise.all(
              options.map(async (option) => {
                return await outgoingPaymentService.create(option)
              })
            )
          ).rejects.toThrowError(
            'Defined query timeout of 5000ms exceeded when running query.'
          )
        } else {
          await Promise.all(
            options.map(async (option) => {
              return await outgoingPaymentService.create(option)
            })
          )
        }
        const payments = await OutgoingPayment.query(trx)
        expect(payments.length).toEqual(1)
        expect([quotes[0].id, quotes[1].id]).toContain(payments[0].id)
      })
      describe('validateGrant', (): void => {
        let quote: Quote
        let options: Omit<CreateOutgoingPaymentOptions, 'grant'>
        let interval: string
        beforeEach(async (): Promise<void> => {
          quote = await createQuote(deps, {
            paymentPointerId,
            receiver,
            sendAmount
          })
          options = {
            paymentPointerId,
            quoteId: quote.id,
            description: 'rent',
            externalRef: '202201'
          }
          const start = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
          interval = `R0/${start.toISOString()}/P1M`
        })
        test('fails if grant limits interval does not cover now', async (): Promise<void> => {
          const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
          const grant = new Grant({
            active: true,
            clientId: grantRef.clientId,
            grant: grantRef.id,
            access: [
              {
                type: AccessType.OutgoingPayment,
                actions: [AccessAction.Create, AccessAction.Read],
                limits: {
                  sendAmount,
                  interval: `R0/${start.toISOString()}/P1M`
                }
              }
            ]
          })
          await expect(
            outgoingPaymentService.create({ ...options, grant })
          ).resolves.toEqual(OutgoingPaymentError.InsufficientGrant)
        })
        test.each`
          limits                                                                         | description
          ${{ sendAmount: { assetCode: 'EUR', assetScale: asset.scale } }}               | ${'sendAmount asset code'}
          ${{ sendAmount: { assetCode: asset.code, assetScale: 2 } }}                    | ${'sendAmount asset scale'}
          ${{ receiveAmount: { assetCode: 'EUR', assetScale: destinationAsset.scale } }} | ${'receiveAmount asset code'}
          ${{ receiveAmount: { assetCode: destinationAsset.code, assetScale: 2 } }}      | ${'receiveAmount asset scale'}
        `(
          'fails if grant limits do not match payment - $description',
          async ({ limits }): Promise<void> => {
            const grant = new Grant({
              active: true,
              clientId: grantRef.clientId,
              grant: grantRef.id,
              access: [
                {
                  type: AccessType.OutgoingPayment,
                  actions: [AccessAction.Create, AccessAction.Read],
                  identifier: `${Config.publicHost}/${paymentPointerId}`,
                  limits: { ...limits, interval }
                }
              ]
            })
            await expect(
              outgoingPaymentService.create({ ...options, grant })
            ).resolves.toEqual(OutgoingPaymentError.InsufficientGrant)
          }
        )
        test.each`
          sendAmount | description
          ${true}    | ${'sendAmount'}
          ${false}   | ${'receiveAmount'}
        `(
          'fails if grant limit $description is not enough for payment ',
          async ({ sendAmount }): Promise<void> => {
            const amount = {
              value: BigInt(12),
              assetCode: sendAmount
                ? quote.asset.code
                : quote.receiveAmount.assetCode,
              assetScale: sendAmount
                ? quote.asset.scale
                : quote.receiveAmount.assetScale
            }
            const grant = new Grant({
              active: true,
              clientId: grantRef.clientId,
              grant: grantRef.id,
              access: [
                {
                  type: AccessType.OutgoingPayment,
                  actions: [AccessAction.Create, AccessAction.Read],
                  identifier: `${Config.publicHost}/${paymentPointerId}`,
                  limits: sendAmount
                    ? {
                        sendAmount: amount,
                        interval
                      }
                    : {
                        receiveAmount: amount,
                        interval
                      }
                }
              ]
            })
            await expect(
              outgoingPaymentService.create({ ...options, grant })
            ).resolves.toEqual(OutgoingPaymentError.InsufficientGrant)
          }
        )
        test.each`
          sendAmount | failed   | description
          ${true}    | ${false} | ${'sendAmount'}
          ${false}   | ${false} | ${'receiveAmount'}
          ${true}    | ${true}  | ${'sendAmount, failed first payment'}
          ${false}   | ${true}  | ${'receiveAmount, failed first payment'}
        `(
          'fails if limit was already used up - $description',
          async ({ sendAmount, failed }): Promise<void> => {
            const grantAmount = {
              value: BigInt(200),
              assetCode: sendAmount
                ? quote.asset.code
                : quote.receiveAmount.assetCode,
              assetScale: sendAmount
                ? quote.asset.scale
                : quote.receiveAmount.assetScale
            }
            const grant = new Grant({
              active: true,
              clientId: grantRef.clientId,
              grant: grantRef.id,
              access: [
                {
                  type: AccessType.OutgoingPayment,
                  actions: [AccessAction.Create, AccessAction.Read],
                  identifier: `${Config.publicHost}/${paymentPointerId}`,
                  limits: {
                    sendAmount: sendAmount ? grantAmount : undefined,
                    receiveAmount: sendAmount ? undefined : grantAmount,
                    interval
                  }
                }
              ]
            })
            const paymentAmount = {
              ...grantAmount,
              value: BigInt(190)
            }
            const firstPayment = await createOutgoingPayment(deps, {
              paymentPointerId,
              receiver: `${
                Config.publicHost
              }/${uuid()}/incoming-payments/${uuid()}`,
              sendAmount: sendAmount ? paymentAmount : undefined,
              receiveAmount: sendAmount ? undefined : paymentAmount,
              grant,
              validDestination: false
            })
            assert.ok(firstPayment)
            if (failed) {
              await firstPayment
                .$query(trx)
                .patch({ state: OutgoingPaymentState.Failed })

              jest
                .spyOn(accountingService, 'getTotalSent')
                .mockResolvedValueOnce(
                  sendAmount ? BigInt(188) : BigInt(188 * 2)
                )
            }

            await expect(
              outgoingPaymentService.create({ ...options, grant })
            ).resolves.toEqual(OutgoingPaymentError.InsufficientGrant)
          }
        )
        test.each`
          limits          | description
          ${undefined}    | ${'has no limits'}
          ${{ receiver }} | ${'limits do not specify send or receive amount'}
        `(
          'succeeds if grant access $description',
          async ({ limits }): Promise<void> => {
            const grant = new Grant({
              active: true,
              clientId: grantRef.clientId,
              grant: grantRef.id,
              access: [
                {
                  type: AccessType.OutgoingPayment,
                  actions: [AccessAction.Create, AccessAction.Read],
                  identifier: `${Config.publicHost}/${paymentPointerId}`,
                  limits
                }
              ]
            })
            await expect(
              outgoingPaymentService.create({ ...options, grant })
            ).resolves.toBeInstanceOf(OutgoingPayment)
          }
        )

        test.each`
          sendAmount | competingPayment | failed       | half     | description
          ${true}    | ${false}         | ${undefined} | ${false} | ${'sendAmount w/o competing payment'}
          ${false}   | ${false}         | ${undefined} | ${false} | ${'receiveAmount w/o competing payment'}
          ${true}    | ${true}          | ${false}     | ${false} | ${'sendAmount w/ competing payment'}
          ${false}   | ${true}          | ${false}     | ${false} | ${'receiveAmount w/ competing payment'}
          ${true}    | ${true}          | ${true}      | ${false} | ${'sendAmount w/ failed competing payment'}
          ${false}   | ${true}          | ${true}      | ${false} | ${'receiveAmount w/ failed competing payment'}
          ${true}    | ${true}          | ${true}      | ${true}  | ${'sendAmount w/ half-way failed competing payment'}
          ${false}   | ${true}          | ${true}      | ${true}  | ${'receiveAmount half-way w/ failed competing payment'}
        `(
          'succeeds if grant limit is enough for payment - $description',
          async ({
            sendAmount,
            competingPayment,
            failed,
            half
          }): Promise<void> => {
            const grantAmount = {
              value: BigInt(1234567),
              assetCode: sendAmount
                ? quote.asset.code
                : quote.receiveAmount.assetCode,
              assetScale: sendAmount
                ? quote.asset.scale
                : quote.receiveAmount.assetScale
            }
            const grant = new Grant({
              active: true,
              clientId: grantRef.clientId,
              grant: grantRef.id,
              access: [
                {
                  type: AccessType.OutgoingPayment,
                  actions: [AccessAction.Create, AccessAction.Read],
                  identifier: `${Config.publicHost}/${paymentPointerId}`,
                  limits: sendAmount
                    ? {
                        sendAmount: grantAmount,
                        interval
                      }
                    : {
                        receiveAmount: grantAmount,
                        interval
                      }
                }
              ]
            })
            if (competingPayment) {
              const paymentAmount = {
                ...grantAmount,
                value: BigInt(7)
              }
              const firstPayment = await createOutgoingPayment(deps, {
                paymentPointerId,
                receiver: `${
                  Config.publicHost
                }/${uuid()}/incoming-payments/${uuid()}`,
                sendAmount: sendAmount ? paymentAmount : undefined,
                receiveAmount: sendAmount ? undefined : paymentAmount,
                grant,
                validDestination: false
              })
              assert.ok(firstPayment)
              if (failed) {
                await firstPayment
                  .$query(trx)
                  .patch({ state: OutgoingPaymentState.Failed })
                if (half) {
                  jest
                    .spyOn(accountingService, 'getTotalSent')
                    .mockResolvedValueOnce(BigInt(100))
                }
              }
            }
            await expect(
              outgoingPaymentService.create({ ...options, grant })
            ).resolves.toBeInstanceOf(OutgoingPayment)
          }
        )
      })
    })
  })

  describe('processNext', (): void => {
    describe.each`
      toConnection | description
      ${true}      | ${'connection'}
      ${false}     | ${'incoming payment'}
    `('SENDING (to $description) → ', ({ toConnection }): void => {
      const receiveAmount = {
        value: BigInt(123),
        assetCode: destinationAsset.code,
        assetScale: destinationAsset.scale
      }

      beforeEach((): void => {
        if (toConnection) {
          receiver = connectionService.getUrl(incomingPayment)
        }
      })

      async function setup(
        opts: Omit<CreateQuoteOptions, 'paymentPointerId'>,
        incomingAmount?: Amount
      ): Promise<string> {
        if (incomingAmount) {
          await incomingPayment.$query(knex).patch({ incomingAmount })
        }
        const payment = await createOutgoingPayment(deps, {
          paymentPointerId,
          ...opts
        })

        trackAmountDelivered(payment.id)

        await expect(
          outgoingPaymentService.fund({
            id: payment.id,
            amount: payment.sendAmount.value,
            transferId: uuid()
          })
        ).resolves.toMatchObject({
          state: OutgoingPaymentState.Sending
        })

        return payment.id
      }

      test.each`
        sendAmount    | receiveAmount
        ${sendAmount} | ${undefined}
        ${undefined}  | ${receiveAmount}
      `('COMPLETED', async ({ sendAmount, receiveAmount }): Promise<void> => {
        const paymentId = await setup({
          receiver,
          sendAmount,
          receiveAmount
        })

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        const amountSent = payment.receiveAmount.value * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.sendAmount.value - amountSent,
          amountSent,
          amountDelivered: payment.receiveAmount.value,
          incomingPaymentReceived: payment.receiveAmount.value,
          withdrawAmount: payment.sendAmount.value - amountSent
        })
      })

      it('COMPLETED (receiveAmount < incomingPayment.incomingAmount)', async (): Promise<void> => {
        incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: receiverPaymentPointer.id,
          grantId: grantRef.id,
          incomingAmount: {
            value: receiveAmount.value * 2n,
            assetCode: receiverPaymentPointer.asset.code,
            assetScale: receiverPaymentPointer.asset.scale
          }
        })
        const paymentId = await setup({
          receiver: toConnection
            ? connectionService.getUrl(incomingPayment)
            : incomingPayment.url,
          receiveAmount
        })

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        const amountSent = payment.receiveAmount.value * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.sendAmount.value - amountSent,
          amountSent,
          amountDelivered: payment.receiveAmount.value,
          incomingPaymentReceived: payment.receiveAmount.value,
          withdrawAmount: payment.sendAmount.value - amountSent
        })
      })

      it('COMPLETED (with incoming payment initially partially paid)', async (): Promise<void> => {
        const paymentId = await setup(
          {
            receiver,
            receiveAmount: toConnection && receiveAmount
          },
          receiveAmount
        )

        const amountAlreadyDelivered = BigInt(34)
        await payIncomingPayment(amountAlreadyDelivered)
        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        // The amountAlreadyDelivered is unknown to the sender when sending to
        // the connection (instead of the incoming payment), so the entire
        // receive amount is delivered by the outgoing payment ("overpaying"
        // the incoming payment).
        // Incoming payments allow overpayment (above the incomingAmount) for
        // one packet. In this case, the full payment amount was completed in a
        // single packet. With a different combination of amounts and
        // maxPacketAmount limits, an outgoing payment to a connection could
        // overpay the corresponding incoming payment's incomingAmount without
        // the full outgoing payment receive amount being delivered.
        const amountSent = toConnection
          ? payment.receiveAmount.value * BigInt(2)
          : (payment.receiveAmount.value - amountAlreadyDelivered) * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.sendAmount.value - amountSent,
          amountSent,
          amountDelivered: toConnection
            ? payment.receiveAmount.value
            : payment.receiveAmount.value - amountAlreadyDelivered,
          incomingPaymentReceived: toConnection
            ? payment.receiveAmount.value + amountAlreadyDelivered
            : payment.receiveAmount.value,
          withdrawAmount: payment.sendAmount.value - amountSent
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
          receiver,
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
          receiver,
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
          receiver,
          receiveAmount
        })

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Sending
        )
        mockFn.mockRestore()
        fastForwardToAttempt(1)
        await expectOutcome(payment, {
          accountBalance: payment.sendAmount.value - BigInt(10),
          amountSent: BigInt(10),
          amountDelivered: BigInt(5)
        })

        // The next attempt is without the mock, so it succeeds.
        const payment2 = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        const sentAmount = payment.receiveAmount.value * BigInt(2)
        await expectOutcome(payment2, {
          accountBalance: payment.sendAmount.value - sentAmount,
          amountSent: sentAmount,
          amountDelivered: payment.receiveAmount.value
        })
      })

      // Caused by retry after failed SENDING→COMPLETED transition commit.
      it('COMPLETED (already fully paid)', async (): Promise<void> => {
        const paymentId = await setup(
          {
            receiver,
            receiveAmount
          },
          receiveAmount
        )

        await processNext(paymentId, OutgoingPaymentState.Completed)
        // Pretend that the transaction didn't commit.
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({ state: OutgoingPaymentState.Sending })
        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        const sentAmount = payment.receiveAmount.value * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.sendAmount.value - sentAmount,
          amountSent: sentAmount,
          amountDelivered: payment.receiveAmount.value
        })
      })

      it('COMPLETED (already fully paid)', async (): Promise<void> => {
        const paymentId = await setup(
          {
            receiver,
            receiveAmount
          },
          receiveAmount
        )
        // The quote thinks there's a full amount to pay, but actually sending will find the incoming payment has been paid (e.g. by another payment).
        await payIncomingPayment(receiveAmount.value)

        const payment = await processNext(
          paymentId,
          OutgoingPaymentState.Completed
        )
        await expectOutcome(payment, {
          accountBalance: payment.sendAmount.value,
          amountSent: BigInt(0),
          amountDelivered: BigInt(0),
          incomingPaymentReceived: receiveAmount.value,
          withdrawAmount: payment.sendAmount.value
        })
      })

      it('FAILED (source asset changed)', async (): Promise<void> => {
        const paymentId = await setup({
          receiver,
          sendAmount
        })
        const assetService = await deps.use('assetService')
        const { id: assetId } = await assetService.getOrCreate({
          code: asset.code,
          scale: asset.scale + 1
        })
        await OutgoingPayment.relatedQuery('paymentPointer')
          .for(paymentId)
          .patch({
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
          receiver,
          sendAmount
        })
        // Pretend that the destination asset was initially different.
        await OutgoingPayment.relatedQuery('quote')
          .for(paymentId)
          .patch({
            receiveAmount: {
              ...receiveAmount,
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
      payment = await createOutgoingPayment(deps, {
        paymentPointerId,
        receiver,
        sendAmount,
        validDestination: false
      })
      quoteAmount = payment.sendAmount.value
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

      const after = await outgoingPaymentService.get({
        id: payment.id
      })
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

      const after = await outgoingPaymentService.get({
        id: payment.id
      })
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

        const after = await outgoingPaymentService.get({
          id: payment.id
        })
        expect(after?.state).toBe(startState)
      })
    })
  })
})
