import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { AccountService } from '../open_payments/account/service'
import { Account } from '../open_payments/account/model'
import { IncomingPaymentService } from '../open_payments/payment/incoming/service'
import { Config, IAppConfig } from '../config/app'
import { GraphileProducer } from '../messaging/graphileProducer'
import { randomAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { resetGraphileDb } from '../tests/graphileDb'
import { initIocContainer } from '..'
import { OutgoingPaymentService } from '../open_payments/payment/outgoing/service'
import { QuoteService } from '../open_payments/quote/service'
import { createIncomingPayment } from '../tests/incomingPayment'
import { createQuote } from '../tests/quote'
import { createOutgoingPayment } from '../tests/outgoingPayment'
import { Amount } from '@interledger/pay/dist/src/open-payments'
import { getPageInfo, parsePaginationQueryParameters } from './pagination'
import { AssetService } from '../asset/service'
import { PeerService } from '../peer/service'
import { PeerFactory } from '../tests/peerFactory'
import { isAssetError } from '../asset/errors'

describe('Pagination', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let accountService: AccountService
  let incomingPaymentService: IncomingPaymentService
  let outgoingPaymentService: OutgoingPaymentService
  let quoteService: QuoteService
  let config: IAppConfig
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(
    async (): Promise<void> => {
      config = Config
      config.publicHost = 'https://wallet.example'
      deps = await initIocContainer(config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(knex)
      await appContainer.shutdown()
      await workerUtils.release()
    }
  )
  describe('parsePaginationQueryParameters', (): void => {
    test.each`
      first        | last         | cursor   | result
      ${undefined} | ${undefined} | ${''}    | ${{ first: undefined, last: undefined, before: undefined, after: undefined }}
      ${10}        | ${undefined} | ${''}    | ${{ first: 10, last: undefined, before: undefined, after: undefined }}
      ${10}        | ${undefined} | ${'abc'} | ${{ first: 10, last: undefined, before: undefined, after: 'abc' }}
      ${undefined} | ${20}        | ${'efg'} | ${{ first: undefined, last: 20, before: 'efg', after: undefined }}
    `(
      "success with first: '$first', last: '$last', cursor: '$cursor'",
      async ({ first, last, cursor, result }): Promise<void> => {
        expect(parsePaginationQueryParameters({ first, last, cursor })).toEqual(
          result
        )
      }
    )
  })
  describe('getPageInfo', (): void => {
    describe('account resources', (): void => {
      let asset: { code: string; scale: number }
      let defaultAccount: Account
      let secondaryAccount: Account
      let secondaryAccountId: string
      let sendAmount: Amount

      beforeEach(
        async (): Promise<void> => {
          accountService = await deps.use('accountService')
          incomingPaymentService = await deps.use('incomingPaymentService')
          outgoingPaymentService = await deps.use('outgoingPaymentService')
          quoteService = await deps.use('quoteService')

          asset = randomAsset()
          defaultAccount = await accountService.create({ asset })
          secondaryAccount = await accountService.create({ asset })
          secondaryAccountId = `${config.publicHost}/${secondaryAccount.id}`
          sendAmount = {
            value: BigInt(42),
            assetCode: asset.code,
            assetScale: asset.scale
          }
        }
      )

      describe('incoming payments', (): void => {
        test.each`
          num   | pagination       | cursor  | start   | end     | hasNextPage | hasPreviousPage
          ${0}  | ${{ first: 5 }}  | ${null} | ${null} | ${null} | ${false}    | ${false}
          ${10} | ${{ first: 5 }}  | ${null} | ${0}    | ${4}    | ${true}     | ${false}
          ${5}  | ${{ first: 10 }} | ${null} | ${0}    | ${4}    | ${false}    | ${false}
          ${10} | ${{ first: 3 }}  | ${3}    | ${4}    | ${6}    | ${true}     | ${true}
          ${10} | ${{ last: 5 }}   | ${9}    | ${4}    | ${8}    | ${true}     | ${true}
        `(
          '$num payments, pagination $pagination with cursor $cursor',
          async ({
            num,
            pagination,
            cursor,
            start,
            end,
            hasNextPage,
            hasPreviousPage
          }): Promise<void> => {
            const paymentIds: string[] = []
            for (let i = 0; i < num; i++) {
              const payment = await createIncomingPayment(deps, {
                accountId: defaultAccount.id
              })
              paymentIds.push(payment.id)
            }
            if (cursor) {
              if (pagination.last) pagination.before = paymentIds[cursor]
              else pagination.after = paymentIds[cursor]
            }
            const page = await incomingPaymentService.getAccountPage(
              defaultAccount.id,
              pagination
            )
            const pageInfo = await getPageInfo(
              (pagination) =>
                incomingPaymentService.getAccountPage(
                  defaultAccount.id,
                  pagination
                ),
              page
            )
            expect(pageInfo).toEqual({
              startCursor: paymentIds[start],
              endCursor: paymentIds[end],
              hasNextPage,
              hasPreviousPage
            })
          }
        )
      })
      describe('outgoing payments', (): void => {
        test.each`
          num   | pagination       | cursor  | start   | end     | hasNextPage | hasPreviousPage
          ${0}  | ${{ first: 5 }}  | ${null} | ${null} | ${null} | ${false}    | ${false}
          ${10} | ${{ first: 5 }}  | ${null} | ${0}    | ${4}    | ${true}     | ${false}
          ${5}  | ${{ first: 10 }} | ${null} | ${0}    | ${4}    | ${false}    | ${false}
          ${10} | ${{ first: 3 }}  | ${3}    | ${4}    | ${6}    | ${true}     | ${true}
          ${10} | ${{ last: 5 }}   | ${9}    | ${4}    | ${8}    | ${true}     | ${true}
        `(
          '$num payments, pagination $pagination with cursor $cursor',
          async ({
            num,
            pagination,
            cursor,
            start,
            end,
            hasNextPage,
            hasPreviousPage
          }): Promise<void> => {
            const paymentIds: string[] = []
            for (let i = 0; i < num; i++) {
              const payment = await createOutgoingPayment(deps, {
                accountId: defaultAccount.id,
                receivingAccount: secondaryAccountId,
                sendAmount,
                validDestination: false
              })
              paymentIds.push(payment.id)
            }
            if (cursor) {
              if (pagination.last) pagination.before = paymentIds[cursor]
              else pagination.after = paymentIds[cursor]
            }
            const page = await outgoingPaymentService.getAccountPage(
              defaultAccount.id,
              pagination
            )
            const pageInfo = await getPageInfo(
              (pagination) =>
                outgoingPaymentService.getAccountPage(
                  defaultAccount.id,
                  pagination
                ),
              page
            )
            expect(pageInfo).toEqual({
              startCursor: paymentIds[start],
              endCursor: paymentIds[end],
              hasNextPage,
              hasPreviousPage
            })
          }
        )
      })
      describe('quotes', (): void => {
        test.each`
          num   | pagination       | cursor  | start   | end     | hasNextPage | hasPreviousPage
          ${0}  | ${{ first: 5 }}  | ${null} | ${null} | ${null} | ${false}    | ${false}
          ${10} | ${{ first: 5 }}  | ${null} | ${0}    | ${4}    | ${true}     | ${false}
          ${5}  | ${{ first: 10 }} | ${null} | ${0}    | ${4}    | ${false}    | ${false}
          ${10} | ${{ first: 3 }}  | ${3}    | ${4}    | ${6}    | ${true}     | ${true}
          ${10} | ${{ last: 5 }}   | ${9}    | ${4}    | ${8}    | ${true}     | ${true}
        `(
          '$num payments, pagination $pagination with cursor $cursor',
          async ({
            num,
            pagination,
            cursor,
            start,
            end,
            hasNextPage,
            hasPreviousPage
          }): Promise<void> => {
            const quoteIds: string[] = []
            for (let i = 0; i < num; i++) {
              const quote = await createQuote(deps, {
                accountId: defaultAccount.id,
                receivingAccount: secondaryAccountId,
                sendAmount,
                validDestination: false
              })
              quoteIds.push(quote.id)
            }
            if (cursor) {
              if (pagination.last) pagination.before = quoteIds[cursor]
              else pagination.after = quoteIds[cursor]
            }
            const page = await quoteService.getAccountPage(
              defaultAccount.id,
              pagination
            )
            const pageInfo = await getPageInfo(
              (pagination) =>
                quoteService.getAccountPage(defaultAccount.id, pagination),
              page
            )
            expect(pageInfo).toEqual({
              startCursor: quoteIds[start],
              endCursor: quoteIds[end],
              hasNextPage,
              hasPreviousPage
            })
          }
        )
      })
    })
    describe('non-account resources', (): void => {
      let assetService: AssetService
      let peerService: PeerService
      let peerFactory: PeerFactory
      beforeEach(
        async (): Promise<void> => {
          assetService = await deps.use('assetService')
          peerService = await deps.use('peerService')
          peerFactory = new PeerFactory(peerService)
        }
      )
      describe('assets', (): void => {
        test.each`
          num   | pagination       | cursor  | start   | end     | hasNextPage | hasPreviousPage
          ${0}  | ${{ first: 5 }}  | ${null} | ${null} | ${null} | ${false}    | ${false}
          ${10} | ${{ first: 5 }}  | ${null} | ${0}    | ${4}    | ${true}     | ${false}
          ${5}  | ${{ first: 10 }} | ${null} | ${0}    | ${4}    | ${false}    | ${false}
          ${10} | ${{ first: 3 }}  | ${3}    | ${4}    | ${6}    | ${true}     | ${true}
          ${10} | ${{ last: 5 }}   | ${9}    | ${4}    | ${8}    | ${true}     | ${true}
        `(
          '$num payments, pagination $pagination with cursor $cursor',
          async ({
            num,
            pagination,
            cursor,
            start,
            end,
            hasNextPage,
            hasPreviousPage
          }): Promise<void> => {
            const assetIds: string[] = []
            for (let i = 0; i < num; i++) {
              const asset = await assetService.create(randomAsset())
              assert.ok(!isAssetError(asset))
              assetIds.push(asset.id)
            }
            if (cursor) {
              if (pagination.last) pagination.before = assetIds[cursor]
              else pagination.after = assetIds[cursor]
            }
            const page = await assetService.getPage(pagination)
            const pageInfo = await getPageInfo(
              (pagination) => assetService.getPage(pagination),
              page
            )
            expect(pageInfo).toEqual({
              startCursor: assetIds[start],
              endCursor: assetIds[end],
              hasNextPage,
              hasPreviousPage
            })
          }
        )
      })
      describe('peers', (): void => {
        test.each`
          num   | pagination       | cursor  | start   | end     | hasNextPage | hasPreviousPage
          ${0}  | ${{ first: 5 }}  | ${null} | ${null} | ${null} | ${false}    | ${false}
          ${10} | ${{ first: 5 }}  | ${null} | ${0}    | ${4}    | ${true}     | ${false}
          ${5}  | ${{ first: 10 }} | ${null} | ${0}    | ${4}    | ${false}    | ${false}
          ${10} | ${{ first: 3 }}  | ${3}    | ${4}    | ${6}    | ${true}     | ${true}
          ${10} | ${{ last: 5 }}   | ${9}    | ${4}    | ${8}    | ${true}     | ${true}
        `(
          '$num payments, pagination $pagination with cursor $cursor',
          async ({
            num,
            pagination,
            cursor,
            start,
            end,
            hasNextPage,
            hasPreviousPage
          }): Promise<void> => {
            const peerIds: string[] = []
            for (let i = 0; i < num; i++) {
              const peer = await peerFactory.build()
              peerIds.push(peer.id)
            }
            if (cursor) {
              if (pagination.last) pagination.before = peerIds[cursor]
              else pagination.after = peerIds[cursor]
            }
            const page = await peerService.getPage(pagination)
            const pageInfo = await getPageInfo(
              (pagination) => peerService.getPage(pagination),
              page
            )
            expect(pageInfo).toEqual({
              startCursor: peerIds[start],
              endCursor: peerIds[end],
              hasNextPage,
              hasPreviousPage
            })
          }
        )
      })
    })
  })
})
