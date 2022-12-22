import assert from 'assert'
import { Knex } from 'knex'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { Amount } from '../open_payments/amount'
import { PaymentPointer } from '../open_payments/payment_pointer/model'
import { IncomingPaymentService } from '../open_payments/payment/incoming/service'
import { Config, IAppConfig } from '../config/app'
import { randomAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { initIocContainer } from '..'
import { OutgoingPaymentService } from '../open_payments/payment/outgoing/service'
import { QuoteService } from '../open_payments/quote/service'
import { createIncomingPayment } from '../tests/incomingPayment'
import { createQuote } from '../tests/quote'
import { createOutgoingPayment } from '../tests/outgoingPayment'
import { createPaymentPointer } from '../tests/paymentPointer'
import { getPageInfo, parsePaginationQueryParameters } from './pagination'
import { AssetService } from '../asset/service'
import { PeerService } from '../peer/service'
import { PeerFactory } from '../tests/peerFactory'
import { isAssetError } from '../asset/errors'

describe('Pagination', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let incomingPaymentService: IncomingPaymentService
  let outgoingPaymentService: OutgoingPaymentService
  let quoteService: QuoteService
  let config: IAppConfig

  beforeAll(async (): Promise<void> => {
    config = Config
    config.publicHost = 'https://wallet.example'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })
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
    describe('payment pointer resources', (): void => {
      let defaultPaymentPointer: PaymentPointer
      let secondaryPaymentPointer: PaymentPointer
      let sendAmount: Amount

      beforeEach(async (): Promise<void> => {
        incomingPaymentService = await deps.use('incomingPaymentService')
        outgoingPaymentService = await deps.use('outgoingPaymentService')
        quoteService = await deps.use('quoteService')

        const asset = randomAsset()
        defaultPaymentPointer = await createPaymentPointer(deps, { asset })
        secondaryPaymentPointer = await createPaymentPointer(deps, {
          asset
        })
        sendAmount = {
          value: BigInt(42),
          assetCode: asset.code,
          assetScale: asset.scale
        }
      })

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
                paymentPointerId: defaultPaymentPointer.id
              })
              paymentIds.push(payment.id)
            }
            if (cursor) {
              if (pagination.last) pagination.before = paymentIds[cursor]
              else pagination.after = paymentIds[cursor]
            }
            const page = await incomingPaymentService.getPaymentPointerPage({
              paymentPointerId: defaultPaymentPointer.id,
              pagination
            })
            const pageInfo = await getPageInfo(
              (pagination) =>
                incomingPaymentService.getPaymentPointerPage({
                  paymentPointerId: defaultPaymentPointer.id,
                  pagination
                }),
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
                paymentPointerId: defaultPaymentPointer.id,
                receiver: secondaryPaymentPointer.url,
                sendAmount,
                validDestination: false
              })
              paymentIds.push(payment.id)
            }
            if (cursor) {
              if (pagination.last) pagination.before = paymentIds[cursor]
              else pagination.after = paymentIds[cursor]
            }
            const page = await outgoingPaymentService.getPaymentPointerPage({
              paymentPointerId: defaultPaymentPointer.id,
              pagination
            })
            const pageInfo = await getPageInfo(
              (pagination) =>
                outgoingPaymentService.getPaymentPointerPage({
                  paymentPointerId: defaultPaymentPointer.id,
                  pagination
                }),
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
                paymentPointerId: defaultPaymentPointer.id,
                receiver: secondaryPaymentPointer.url,
                sendAmount,
                validDestination: false
              })
              quoteIds.push(quote.id)
            }
            if (cursor) {
              if (pagination.last) pagination.before = quoteIds[cursor]
              else pagination.after = quoteIds[cursor]
            }
            const page = await quoteService.getPaymentPointerPage({
              paymentPointerId: defaultPaymentPointer.id,
              pagination
            })
            const pageInfo = await getPageInfo(
              (pagination) =>
                quoteService.getPaymentPointerPage({
                  paymentPointerId: defaultPaymentPointer.id,
                  pagination
                }),
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
    describe('non-payment pointer resources', (): void => {
      let assetService: AssetService
      let peerService: PeerService
      let peerFactory: PeerFactory
      beforeEach(async (): Promise<void> => {
        assetService = await deps.use('assetService')
        peerService = await deps.use('peerService')
        peerFactory = new PeerFactory(peerService)
      })
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
