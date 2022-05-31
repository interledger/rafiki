import assert from 'assert'
import Knex, { Transaction } from 'knex'
import crypto from 'crypto'
import { v4 } from 'uuid'

import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { FinishMethod, Grant, GrantState, StartMethod } from '../grant/model'
import { AccessType, Action } from '../access/types'
import { AccessToken } from './model'
import { AccessTokenService } from './service'
import { Access } from '../access/model'

describe('Access Token Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let trx: Transaction
  let accessTokenService: AccessTokenService

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      accessTokenService = await deps.use('accessTokenService')
    }
  )

  afterEach(
    async (): Promise<void> => {
      jest.useRealTimers()
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
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

  const BASE_ACCESS = {
    type: AccessType.OutgoingPayment,
    actions: [Action.Read, Action.Create],
    limits: {
      receivingAccount: 'https://wallet.com/alice',
      sendAmount: {
        value: '400',
        assetCode: 'USD',
        assetScale: 2
      }
    }
  }

  const BASE_TOKEN = {
    value: crypto.randomBytes(8).toString('hex').toUpperCase(),
    managementId: 'https://example.com/manage/12345',
    expiresIn: 3600
  }

  describe('Introspect', (): void => {
    let grant: Grant
    let access: Access
    let token: AccessToken
    beforeEach(
      async (): Promise<void> => {
        grant = await Grant.query(trx).insertAndFetch({
          ...BASE_GRANT
        })
        access = await Access.query(trx).insertAndFetch({
          grantId: grant.id,
          ...BASE_ACCESS
        })
        token = await AccessToken.query(trx).insertAndFetch({
          grantId: grant.id,
          ...BASE_TOKEN
        })
      }
    )
    test('Can introspect active token', async (): Promise<void> => {
      const introspection = await accessTokenService.introspect(token.value)
      assert.ok(introspection)
      expect(introspection.active).toEqual(true)
      expect(introspection).toMatchObject({ ...grant, access: [access] })
    })

    test('Can introspect expired token', async (): Promise<void> => {
      const now = new Date(new Date().getTime() + 4000)
      jest.useFakeTimers('modern')
      jest.setSystemTime(now)
      const introspection = await accessTokenService.introspect(token.value)
      expect(introspection).toEqual({ active: false })
    })

    test('Cannot introspect non-existing token', async (): Promise<void> => {
      expect(accessTokenService.introspect('uuid')).resolves.toBeUndefined()
    })
  })
})
