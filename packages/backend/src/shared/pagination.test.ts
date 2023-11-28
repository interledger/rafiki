import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { Amount } from '../open_payments/amount'
import { WalletAddress } from '../open_payments/wallet_address/model'
import { IncomingPaymentService } from '../open_payments/payment/incoming/service'
import { Config, IAppConfig } from '../config/app'
import { createAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { initIocContainer } from '..'
import { OutgoingPaymentService } from '../open_payments/payment/outgoing/service'
import { QuoteService } from '../open_payments/quote/service'
import { createIncomingPayment } from '../tests/incomingPayment'
import { createQuote } from '../tests/quote'
import { createOutgoingPayment } from '../tests/outgoingPayment'
import { createWalletAddress } from '../tests/walletAddress'
import { getPageInfo, parsePaginationQueryParameters } from './pagination'
import { AssetService } from '../asset/service'
import { PeerService } from '../payment-method/ilp/peer/service'
import { createPeer } from '../tests/peer'
import { SortOrder } from './baseModel'

describe('Pagination', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let incomingPaymentService: IncomingPaymentService
  let outgoingPaymentService: OutgoingPaymentService
  let quoteService: QuoteService
  let config: IAppConfig
  let sortOrder: SortOrder

  beforeAll(async (): Promise<void> => {
    config = Config
    config.publicHost = 'https://wallet.example'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    sortOrder = Math.random() < 0.5 ? SortOrder.Asc : SortOrder.Desc
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
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
    describe('wallet address resources', (): void => {
      let defaultWalletAddress: WalletAddress
      let secondaryWalletAddress: WalletAddress
      let debitAmount: Amount

      beforeEach(async (): Promise<void> => {
        incomingPaymentService = await deps.use('incomingPaymentService')
        outgoingPaymentService = await deps.use('outgoingPaymentService')
        quoteService = await deps.use('quoteService')

        const asset = await createAsset(deps)
        defaultWalletAddress = await createWalletAddress(deps, {
          assetId: asset.id
        })
        secondaryWalletAddress = await createWalletAddress(deps, {
          assetId: asset.id
        })
        debitAmount = {
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
                walletAddressId: defaultWalletAddress.id
              })
              paymentIds.push(payment.id)
            }
            if (sortOrder === SortOrder.Desc) {
              paymentIds.reverse()
            }
            if (cursor) {
              if (pagination.last) pagination.before = paymentIds[cursor]
              else pagination.after = paymentIds[cursor]
            }
            const page = await incomingPaymentService.getWalletAddressPage({
              walletAddressId: defaultWalletAddress.id,
              pagination,
              sortOrder
            })
            const pageInfo = await getPageInfo(
              (pagination, sortOrder) =>
                incomingPaymentService.getWalletAddressPage({
                  walletAddressId: defaultWalletAddress.id,
                  pagination,
                  sortOrder
                }),
              page,
              sortOrder
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
                walletAddressId: defaultWalletAddress.id,
                receiver: secondaryWalletAddress.url,
                method: 'ilp',
                debitAmount,
                validDestination: false
              })
              paymentIds.push(payment.id)
            }
            if (sortOrder === SortOrder.Desc) {
              paymentIds.reverse()
            }
            if (cursor) {
              if (pagination.last) pagination.before = paymentIds[cursor]
              else pagination.after = paymentIds[cursor]
            }
            const page = await outgoingPaymentService.getWalletAddressPage({
              walletAddressId: defaultWalletAddress.id,
              pagination,
              sortOrder
            })
            const pageInfo = await getPageInfo(
              (pagination, sortOrder) =>
                outgoingPaymentService.getWalletAddressPage({
                  walletAddressId: defaultWalletAddress.id,
                  pagination,
                  sortOrder
                }),
              page,
              sortOrder
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
                walletAddressId: defaultWalletAddress.id,
                receiver: secondaryWalletAddress.url,
                debitAmount,
                validDestination: false,
                method: 'ilp'
              })
              quoteIds.push(quote.id)
            }
            if (sortOrder === SortOrder.Desc) {
              quoteIds.reverse()
            }
            if (cursor) {
              if (pagination.last) pagination.before = quoteIds[cursor]
              else pagination.after = quoteIds[cursor]
            }
            const page = await quoteService.getWalletAddressPage({
              walletAddressId: defaultWalletAddress.id,
              pagination,
              sortOrder
            })
            const pageInfo = await getPageInfo(
              (pagination, sortOrder) =>
                quoteService.getWalletAddressPage({
                  walletAddressId: defaultWalletAddress.id,
                  pagination,
                  sortOrder
                }),
              page,
              sortOrder
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
    describe('non-wallet address resources', (): void => {
      let assetService: AssetService
      let peerService: PeerService
      beforeEach(async (): Promise<void> => {
        assetService = await deps.use('assetService')
        peerService = await deps.use('peerService')
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
              const asset = await createAsset(deps)
              assetIds.push(asset.id)
            }
            if (sortOrder === SortOrder.Desc) {
              assetIds.reverse()
            }
            if (cursor) {
              if (pagination.last) pagination.before = assetIds[cursor]
              else pagination.after = assetIds[cursor]
            }
            const page = await assetService.getPage(pagination, sortOrder)
            const pageInfo = await getPageInfo(
              (pagination) => assetService.getPage(pagination, sortOrder),
              page,
              sortOrder
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
              const peer = await createPeer(deps)
              peerIds.push(peer.id)
            }
            if (sortOrder === SortOrder.Desc) {
              peerIds.reverse()
            }
            if (cursor) {
              if (pagination.last) pagination.before = peerIds[cursor]
              else pagination.after = peerIds[cursor]
            }
            const page = await peerService.getPage(pagination, sortOrder)
            const pageInfo = await getPageInfo(
              (pagination, sortOrder) =>
                peerService.getPage(pagination, sortOrder),
              page,
              sortOrder
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
