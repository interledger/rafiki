import nock from 'nock'
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

const KEY_REGISTRY_ORIGIN = 'https://openpayments.network'
const TEST_KID_PATH = '/keys/test-key'
const TEST_CLIENT_KEY = {
  kid: KEY_REGISTRY_ORIGIN + TEST_KID_PATH,
  x: 'test-public-key',
  kty: 'OKP',
  alg: 'EdDSA',
  crv: 'Ed25519',
  key_ops: ['sign', 'verify'],
  use: 'sig'
}

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
      nock.restore()
      await appContainer.shutdown()
    }
  )

  const BASE_GRANT = {
    state: GrantState.Pending,
    startMethod: [StartMethod.Redirect],
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com/finish',
    clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
    clientKeyId: KEY_REGISTRY_ORIGIN + TEST_KID_PATH
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
    managementId: 'https://example.com/manage/12345',
    expiresIn: 3600
  }

  let grant: Grant
  let access: Access
  let token: AccessToken
  beforeEach(
    async (): Promise<void> => {
      grant = await Grant.query(trx).insertAndFetch({
        ...BASE_GRANT,
        continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
        continueId: v4(),
        interactId: v4(),
        interactRef: crypto.randomBytes(8).toString('hex').toUpperCase(),
        interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
      })
      access = await Access.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_ACCESS
      })
      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN,
        value: crypto.randomBytes(8).toString('hex').toUpperCase()
      })
    }
  )

  describe('Create', (): void => {
    test('Can create access token', async (): Promise<void> => {
      const accessToken = await accessTokenService.create(grant.id)
      expect(accessToken).toMatchObject({
        grantId: grant.id,
        managementId: expect.any(String),
        value: expect.any(String)
      })
    })
  })

  describe('Introspect', (): void => {
    test('Can introspect active token', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          keys: [TEST_CLIENT_KEY]
        })
      const introspection = await accessTokenService.introspect(token.value)
      assert.ok(introspection)
      expect(introspection.active).toEqual(true)
      expect(introspection).toMatchObject({
        ...grant,
        access: [access],
        key: { proof: 'httpsig', jwk: TEST_CLIENT_KEY }
      })
      scope.isDone()
    })

    test('Can introspect expired token', async (): Promise<void> => {
      const now = new Date(new Date().getTime() + 4000)
      jest.useFakeTimers('modern')
      jest.setSystemTime(now)
      const introspection = await accessTokenService.introspect(token.value)
      expect(introspection).toEqual({ active: false })
    })

    test('Can introspect active token for revoked grant', async (): Promise<void> => {
      await grant.$query(trx).patch({ state: GrantState.Revoked })
      const introspection = await accessTokenService.introspect(token.value)
      expect(introspection).toEqual({ active: false })
    })

    test('Cannot introspect non-existing token', async (): Promise<void> => {
      expect(accessTokenService.introspect('uuid')).resolves.toBeUndefined()
    })
  })

  describe('Revoke', (): void => {
    let grant: Grant
    let token: AccessToken
    beforeEach(
      async (): Promise<void> => {
        grant = await Grant.query(trx).insertAndFetch({
          ...BASE_GRANT,
          continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
          continueId: v4(),
          interactId: v4(),
          interactRef: crypto.randomBytes(8).toString('hex').toUpperCase(),
          interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
        })
        token = await AccessToken.query(trx).insertAndFetch({
          grantId: grant.id,
          ...BASE_TOKEN,
          value: crypto.randomBytes(8).toString('hex').toUpperCase()
        })
      }
    )
    test('Can revoke un-expired token', async (): Promise<void> => {
      await token.$query(trx).patch({ expiresIn: 1000000 })
      const result = await accessTokenService.revoke(token.id)
      expect(result).toBeUndefined()
      token = await AccessToken.query(trx).findById(token.id)
      expect(token.expiresIn).toBe(1)
    })
    test('Can revoke even if token has already expired', async (): Promise<void> => {
      await token.$query(trx).patch({ expiresIn: -1 })
      const result = await accessTokenService.revoke(token.id)
      expect(result).toBeUndefined()
      token = await AccessToken.query(trx).findById(token.id)
      expect(token.expiresIn).toBe(-1)
    })
    test('Cannot revoke nonexistent token', async (): Promise<void> => {
      expect(accessTokenService.revoke('uuid')).rejects.toBeInstanceOf(Error)
    })
  })
})
