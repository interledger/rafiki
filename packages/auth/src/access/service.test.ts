import crypto from 'crypto'
import nock from 'nock'
import Knex, { Transaction } from 'knex'
import { v4 } from 'uuid'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { AccessService } from './service'
import { Grant, GrantState, StartMethod, FinishMethod } from '../grant/model'
import { Action, AccessType, AccessRequest } from './types'

describe('Access Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accessService: AccessService
  let knex: Knex
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      accessService = await deps.use('accessService')
      knex = await deps.use('knex')
      appContainer = await createTestApp(deps)
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      nock.restore()
      await appContainer.shutdown()
    }
  )

  const BASE_GRANT = {
    state: GrantState.Pending,
    startMethod: [StartMethod.Redirect],
    continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
    continueId: v4(),
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com/finish',
    clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
    interactId: v4(),
    interactRef: crypto.randomBytes(8).toString('hex').toUpperCase(),
    interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
  }

  test('Can create incoming payment access', async (): Promise<void> => {
    const incomingPaymentLimit = {
      incomingAmount: {
        value: '1000000000',
        assetCode: 'usd',
        assetScale: 9
      },
      expiresAt: new Date().toISOString(),
      description: 'this is a test',
      externalRef: v4()
    }

    const grant = await Grant.query(trx).insertAndFetch({
      ...BASE_GRANT
    })

    const incomingPaymentAccess: AccessRequest = {
      type: AccessType.IncomingPayment,
      actions: [Action.Create, Action.Read, Action.List],
      limits: incomingPaymentLimit
    }

    const access = await accessService.createAccess(
      grant.id,
      incomingPaymentAccess
    )

    expect(access.grantId).toEqual(grant.id)
    expect(access.type).toEqual(AccessType.IncomingPayment)
    expect(access.limits).toEqual(incomingPaymentLimit)
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
      description: 'this is a test',
      externalRef: v4(),
      receivingAccount: 'test-account',
      receivingPayment: 'test-payment'
    }

    const outgoingPaymentAccess: AccessRequest = {
      type: AccessType.OutgoingPayment,
      actions: [Action.Create, Action.Read, Action.List],
      limits: outgoingPaymentLimit
    }

    const grant = await Grant.query(trx).insertAndFetch(BASE_GRANT)

    const access = await accessService.createAccess(
      grant.id,
      outgoingPaymentAccess
    )

    expect(access.grantId).toEqual(grant.id)
    expect(access.type).toEqual(AccessType.OutgoingPayment)
    expect(access.limits).toEqual(outgoingPaymentLimit)
  })
})
