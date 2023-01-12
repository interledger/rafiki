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
import { AccessType, AccessAction } from 'open-payments'

describe('Access Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accessService: AccessService
  let knex: Knex
  let trx: Knex.Transaction

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    accessService = await deps.use('accessService')
    knex = await deps.use('knex')
    appContainer = await createTestApp(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  const BASE_GRANT = {
    state: GrantState.Pending,
    startMethod: [StartMethod.Redirect],
    continueToken: generateToken(),
    continueId: v4(),
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com/finish',
    clientNonce: generateNonce(),
    client: faker.internet.url(),
    clientKeyId: 'test-key',
    interactId: v4(),
    interactRef: generateNonce(),
    interactNonce: generateNonce()
  }

  test('Can create incoming payment access', async (): Promise<void> => {
    const grant = await Grant.query(trx).insertAndFetch({
      ...BASE_GRANT
    })

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
      sendAmount: {
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

    const grant = await Grant.query(trx).insertAndFetch(BASE_GRANT)

    const access = await accessService.createAccess(grant.id, [
      outgoingPaymentAccess
    ])

    expect(access.length).toEqual(1)
    expect(access[0].grantId).toEqual(grant.id)
    expect(access[0].type).toEqual(AccessType.OutgoingPayment)
    expect(access[0].limits).toEqual(outgoingPaymentLimit)
  })
})
