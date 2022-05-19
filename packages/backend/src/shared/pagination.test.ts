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
import { IncomingPayment } from '../open_payments/payment/incoming/model'
import { OutgoingPayment } from '../open_payments/payment/outgoing/model'
import { Quote } from '../open_payments/quote/model'
import { Amount } from '@interledger/pay/dist/src/open-payments'
import { getPageInfo, list } from './pagination'
import { isIncomingPaymentError } from '../open_payments/payment/incoming/errors'
import { AssetService } from '../asset/service'
import { PeerService } from '../peer/service'
import { PeerFactory } from '../tests/peerFactory'

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

  let asset: { code: string; scale: number }
  let defaultAccount: Account
  let defaultAccountId: string
  let secondaryAccount: Account
  let secondaryAccountId: string
  let expiresAt: Date
  let sendAmount: Amount

  beforeEach(
    async (): Promise<void> => {
      accountService = await deps.use('accountService')
      incomingPaymentService = await deps.use('incomingPaymentService')
      outgoingPaymentService = await deps.use('outgoingPaymentService')
      quoteService = await deps.use('quoteService')

      asset = randomAsset()
      expiresAt = new Date(Date.now() + 30_000)
      defaultAccount = await accountService.create({ asset })
      defaultAccountId = `${config.publicHost}/${defaultAccount.id}`
      secondaryAccount = await accountService.create({ asset })
      secondaryAccountId = `${config.publicHost}/${secondaryAccount.id}`
      sendAmount = {
        value: BigInt(42),
        assetCode: asset.code,
        assetScale: asset.scale
      }
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

  describe('list', (): void => {
    let items: (IncomingPayment | OutgoingPayment | Quote)[]
    let result: unknown[]
    let service: IncomingPaymentService | OutgoingPaymentService | QuoteService
    const setup = async function (resourceType: string) {
      switch (resourceType) {
        case 'incoming-payments':
          for (let i = 0; i < 3; i++) {
            const ip = await createIncomingPayment(deps, {
              accountId: defaultAccount.id,
              description: `p${i}`,
              expiresAt
            })
            assert.ok(!isIncomingPaymentError(ip))
            items.push(ip)
          }
          result = [0, 1, 2].map((i) => {
            return {
              id: `${defaultAccountId}/${resourceType}/${items[i].id}`,
              accountId: defaultAccountId,
              incomingAmount: null,
              receivedAmount: {
                value: '0',
                assetCode: asset.code,
                assetScale: asset.scale
              },
              description: items[i]['description'],
              externalRef: null,
              state: 'pending',
              expiresAt: expiresAt.toISOString(),
              createdAt: items[i].createdAt.toISOString(),
              updatedAt: items[i].updatedAt.toISOString()
            }
          })
          break
        case 'outgoing-payments':
          for (let i = 0; i < 3; i++) {
            const op = await createOutgoingPayment(deps, {
              accountId: defaultAccount.id,
              receivingAccount: secondaryAccountId,
              sendAmount,
              description: `p${i}`
            })
            items.push(op)
          }
          result = [0, 1, 2].map((i) => {
            return {
              id: `${defaultAccountId}/${resourceType}/${items[i].id}`,
              accountId: defaultAccountId,
              receivingPayment: items[i]['receivingPayment'],
              sendAmount: {
                ...sendAmount,
                value: sendAmount.value.toString()
              },
              receiveAmount: {
                ...items[i]['receiveAmount'],
                value: items[i]['receiveAmount'].value.toString()
              },
              sentAmount: {
                value: '0',
                assetCode: asset.code,
                assetScale: asset.scale
              },
              state: 'funding',
              description: items[i]['description'],
              externalRef: null,
              createdAt: items[i].createdAt.toISOString(),
              updatedAt: items[i].updatedAt.toISOString()
            }
          })
          break
        default:
          for (let i = 0; i < 3; i++) {
            const ip = await createQuote(deps, {
              accountId: defaultAccount.id,
              receivingAccount: secondaryAccountId,
              sendAmount
            })
            items.push(ip)
          }
          result = [0, 1, 2].map((i) => {
            return {
              id: `${defaultAccountId}/${resourceType}/${items[i].id}`,
              accountId: defaultAccountId,
              receivingPayment: items[i]['receivingPayment'],
              sendAmount: {
                ...sendAmount,
                value: sendAmount.value.toString()
              },
              receiveAmount: {
                ...items[i]['receiveAmount'],
                value: items[i]['receiveAmount'].value.toString()
              },
              expiresAt: items[i]['expiresAt'].toISOString(),
              createdAt: items[i].createdAt.toISOString(),
              updatedAt: items[i].updatedAt.toISOString()
            }
          })
      }
    }
    beforeEach(
      async (): Promise<void> => {
        items = []
      }
    )
    describe.each`
      serviceName
      ${'incomingPaymentService'}
      ${'outgoingPaymentService'}
      ${'quoteService'}
    `('$serviceName', ({ serviceName }): void => {
      beforeEach(
        async (): Promise<void> => {
          switch (serviceName) {
            case 'incomingPaymentService':
              service = incomingPaymentService
              await setup('incoming-payments')
              break
            case 'outgoingPaymentService':
              service = outgoingPaymentService
              await setup('outgoing-payments')
              break
            default:
              service = quoteService
              await setup('quotes')
          }
        }
      )

      test.each`
        first   | last    | cursorIndex | pagination                                                  | startIndex | endIndex | description
        ${null} | ${null} | ${-1}       | ${{ first: 3, hasPreviousPage: false, hasNextPage: false }} | ${0}       | ${2}     | ${'no pagination parameters'}
        ${'10'} | ${null} | ${-1}       | ${{ first: 3, hasPreviousPage: false, hasNextPage: false }} | ${0}       | ${2}     | ${'only `first`'}
        ${'10'} | ${null} | ${0}        | ${{ first: 2, hasPreviousPage: true, hasNextPage: false }}  | ${1}       | ${2}     | ${'`first` plus `cursor`'}
        ${null} | ${'10'} | ${2}        | ${{ last: 2, hasPreviousPage: false, hasNextPage: true }}   | ${0}       | ${1}     | ${'`last` plus `cursor`'}
      `(
        'returns 200 on $description',
        async ({
          first,
          last,
          cursorIndex,
          pagination,
          startIndex,
          endIndex
        }): Promise<void> => {
          const cursor = items[cursorIndex] ? items[cursorIndex].id : undefined
          pagination['startCursor'] = items[startIndex].id
          pagination['endCursor'] = items[endIndex].id
          const listResult = await list(
            service,
            config.publicHost,
            defaultAccount.id,
            {
              first,
              last,
              before: last ? cursor : undefined,
              after: !last ? cursor : undefined
            }
          )
          expect(listResult).toEqual({
            pagination,
            result: result.slice(startIndex, endIndex + 1)
          })
        }
      )
    })
  })

  describe('getPageInfo', (): void => {
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
    test('incoming payments', async (): Promise<void> => {
      for (let i = 0; i < 10; i++) {
        await createIncomingPayment(deps, {
          accountId: defaultAccount.id
        })
      }
      const page = await incomingPaymentService.getAccountPage(
        defaultAccount.id,
        { first: 5 }
      )
      const pageInfo = await getPageInfo(
        incomingPaymentService,
        page,
        defaultAccount.id
      )
      expect(pageInfo).toEqual({
        endCursor: page[4].id,
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: page[0].id
      })
    })
    test('outgoing payments', async (): Promise<void> => {
      for (let i = 0; i < 10; i++) {
        await createOutgoingPayment(deps, {
          accountId: defaultAccount.id,
          receivingAccount: secondaryAccountId,
          sendAmount,
          validDestination: false
        })
      }
      const page = await outgoingPaymentService.getAccountPage(
        defaultAccount.id,
        { first: 5 }
      )
      const pageInfo = await getPageInfo(
        outgoingPaymentService,
        page,
        defaultAccount.id
      )
      expect(pageInfo).toEqual({
        endCursor: page[4].id,
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: page[0].id
      })
    })
    test('quotes', async (): Promise<void> => {
      for (let i = 0; i < 10; i++) {
        await createQuote(deps, {
          accountId: defaultAccount.id,
          receivingAccount: secondaryAccountId,
          sendAmount,
          validDestination: false
        })
      }
      const page = await quoteService.getAccountPage(defaultAccount.id, {
        first: 5
      })
      const pageInfo = await getPageInfo(quoteService, page, defaultAccount.id)
      expect(pageInfo).toEqual({
        endCursor: page[4].id,
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: page[0].id
      })
    })
    test('assets', async (): Promise<void> => {
      for (let i = 0; i < 10; i++) {
        await assetService.create(randomAsset())
      }
      const page = await assetService.getPage({
        first: 5
      })
      const pageInfo = await getPageInfo(assetService, page)
      expect(pageInfo).toEqual({
        endCursor: page[4].id,
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: page[0].id
      })
    })
    test('peers', async (): Promise<void> => {
      for (let i = 0; i < 10; i++) {
        await peerFactory.build()
      }
      const page = await peerService.getPage({
        first: 5
      })
      const pageInfo = await getPageInfo(peerService, page)
      expect(pageInfo).toEqual({
        endCursor: page[4].id,
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: page[0].id
      })
    })
  })
})
