import { faker } from '@faker-js/faker'
import nock from 'nock'
import { Knex } from 'knex'
import { v4 } from 'uuid'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { AccessService } from './service'
import { Grant, GrantState, StartMethod, FinishMethod } from '../grant/model'
import { IncomingPaymentRequest, OutgoingPaymentRequest } from './types'
import { generateNonce, generateToken } from '../shared/utils'
import { AccessType, AccessAction } from '@interledger/open-payments'
import { Access } from './model'

describe('Access Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accessService: AccessService
  let knex: Knex
  let grant: Grant

  const generateBaseGrant = () => ({
    state: GrantState.Pending,
    startMethod: [StartMethod.Redirect],
    continueToken: generateToken(),
    continueId: v4(),
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com/finish',
    clientNonce: generateNonce(),
    client: faker.internet.url({ appendSlash: false })
  })

  beforeEach(async (): Promise<void> => {
    grant = await Grant.query(knex).insertAndFetch(generateBaseGrant())
  })

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    accessService = await deps.use('accessService')
    knex = appContainer.knex
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test('Can create incoming payment access', async (): Promise<void> => {
      const incomingPaymentAccess: IncomingPaymentRequest = {
        type: 'incoming-payment',
        actions: [AccessAction.Create, AccessAction.Read, AccessAction.List]
      }

      const access = await accessService.createAccess(grant.id, [
        incomingPaymentAccess
      ])

      expect(access.length).toEqual(1)
      expect(access[0].grantId).toEqual(grant.id)
      expect(access[0].type).toEqual(AccessType.IncomingPayment)
    })

    test('Can create outgoing payment access', async (): Promise<void> => {
      const outgoingPaymentLimit = {
        debitAmount: {
          value: '1000000000',
          assetCode: 'usd',
          assetScale: 9
        },
        receiveAmount: {
          value: '2000000000',
          assetCode: 'usd',
          assetScale: 9
        },
        expiresAt: new Date().toISOString(),
        receiver: 'https://wallet.com/alice'
      }

      const outgoingPaymentAccess: OutgoingPaymentRequest = {
        type: 'outgoing-payment',
        actions: [AccessAction.Create, AccessAction.Read, AccessAction.List],
        limits: outgoingPaymentLimit
      }

      const access = await accessService.createAccess(grant.id, [
        outgoingPaymentAccess
      ])

      expect(access.length).toEqual(1)
      expect(access[0].grantId).toEqual(grant.id)
      expect(access[0].type).toEqual(AccessType.OutgoingPayment)
      expect(access[0].limits).toEqual(outgoingPaymentLimit)
    })
  })

  describe('getByGrant', (): void => {
    test('gets access', async () => {
      const incomingPaymentAccess: IncomingPaymentRequest = {
        type: 'incoming-payment',
        actions: [AccessAction.Create, AccessAction.Read, AccessAction.List]
      }

      const access = await Access.query(knex).insert([
        {
          grantId: grant.id,
          type: incomingPaymentAccess.type,
          actions: incomingPaymentAccess.actions
        }
      ])

      const fetchedAccess = await accessService.getByGrant(grant.id)

      expect(fetchedAccess.length).toEqual(1)
      expect(fetchedAccess[0].id).toEqual(access[0].id)
      expect(fetchedAccess[0].grantId).toEqual(grant.id)
      expect(fetchedAccess[0].type).toEqual(AccessType.IncomingPayment)
      expect(fetchedAccess[0].actions).toEqual(incomingPaymentAccess.actions)
    })
  })
})
