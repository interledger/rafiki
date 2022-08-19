import nock from 'nock'
import Knex, { Transaction } from 'knex'
import crypto from 'crypto'
import { v4 } from 'uuid'
import jestOpenAPI from 'jest-openapi'

import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { FinishMethod, Grant, GrantState, StartMethod } from '../grant/model'
import { AccessType, Action } from '../access/types'
import { AccessToken } from './model'
import { Access } from '../access/model'
import { AccessTokenRoutes } from './routes'
import { createContext } from '../tests/context'

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

describe('Access Token Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let trx: Transaction
  let accessTokenRoutes: AccessTokenRoutes

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      accessTokenRoutes = await deps.use('accessTokenRoutes')
      jestOpenAPI(await deps.use('openApi'))
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
    continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
    continueId: v4(),
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com/finish',
    clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
    clientKeyId: KEY_REGISTRY_ORIGIN + TEST_KID_PATH,
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
    test('Cannot introspect fake token', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' },
          url: '/introspect',
          method: 'POST'
        },
        {}
      )
      ctx.request.body = {
        access_token: v4(),
        proof: 'httpsig',
        resource_server: 'test'
      }
      await expect(accessTokenRoutes.introspect(ctx)).rejects.toMatchObject({
        status: 404,
        message: 'token not found'
      })
    })

    test('Cannot introspect if no token passed', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' },
          url: '/introspect',
          method: 'POST'
        },
        {}
      )
      ctx.request.body = {
        proof: 'httpsig',
        resource_server: 'test'
      }
      await expect(accessTokenRoutes.introspect(ctx)).rejects.toMatchObject({
        status: 400,
        message: 'invalid introspection request'
      })
    })

    test('Successfully introspects valid token', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          keys: [TEST_CLIENT_KEY]
        })
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' },
          url: '/introspect',
          method: 'POST'
        },
        {}
      )
      ctx.request.body = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }
      await expect(accessTokenRoutes.introspect(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.status).toBe(200)
      expect(ctx.response.get('Content-Type')).toBe(
        'application/json; charset=utf-8'
      )
      expect(ctx.body).toEqual({
        active: true,
        grant: grant.id,
        access: [
          {
            type: access.type,
            actions: access.actions,
            limits: access.limits
          }
        ],
        key: { proof: 'httpsig', jwk: TEST_CLIENT_KEY }
      })
      scope.isDone()
    })

    test('Successfully introspects expired token', async (): Promise<void> => {
      const now = new Date(new Date().getTime() + 4000)
      jest.useFakeTimers()
      jest.setSystemTime(now)
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' },
          url: '/introspect',
          method: 'POST'
        },
        {}
      )
      ctx.request.body = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }
      await expect(accessTokenRoutes.introspect(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.status).toBe(200)
      expect(ctx.response.get('Content-Type')).toBe(
        'application/json; charset=utf-8'
      )
      expect(ctx.body).toEqual({
        active: false
      })
    })
  })

  describe('Revocation', (): void => {
    let grant: Grant
    let token: AccessToken
    let id: string

    beforeEach(
      async (): Promise<void> => {
        grant = await Grant.query(trx).insertAndFetch({
          ...BASE_GRANT
        })
        token = await AccessToken.query(trx).insertAndFetch({
          grantId: grant.id,
          ...BASE_TOKEN
        })
        id = token.id
      }
    )

    test('Returns status 204 even if token does not exist', async (): Promise<void> => {
      id = v4()
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' },
          url: `/token/${id}`,
          method: 'DELETE'
        },
        { id }
      )

      await accessTokenRoutes.revoke(ctx)
      expect(ctx.response.status).toBe(204)
    })

    test('Returns status 204 if token has not expired', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' },
          url: `/token/${id}`,
          method: 'DELETE'
        },
        { id }
      )

      await token.$query(trx).patch({ expiresIn: 10000 })
      await accessTokenRoutes.revoke(ctx)
      expect(ctx.response.status).toBe(204)
    })

    test('Returns status 204 if token has expired', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' },
          url: `/token/${id}`,
          method: 'DELETE'
        },
        { id }
      )

      await token.$query(trx).patch({ expiresIn: -1 })
      await accessTokenRoutes.revoke(ctx)
      expect(ctx.response.status).toBe(204)
    })
  })

  describe('Rotation', (): void => {
    let grant: Grant
    let access: Access
    let token: AccessToken
    let managementId: string

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
        managementId = BASE_TOKEN.managementId
      }
    )

    test('Cannot rotate nonexistent token', async (): Promise<void> => {
      managementId = v4()
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { managementId }
      )

      await expect(accessTokenRoutes.rotate(ctx)).rejects.toMatchObject({
        status: 404,
        message: 'token not found'
      })
    })

    test('Can rotate token', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' },
          url: `/token/${token.id}`,
          method: 'POST'
        },
        { managementId }
      )

      await accessTokenRoutes.rotate(ctx)
      expect(ctx.response.get('Content-Type')).toBe(
        'application/json; charset=utf-8'
      )
      expect(ctx.body).toMatchObject({
        access_token: {
          access: [
            {
              type: access.type,
              actions: access.actions,
              limits: access.limits
            }
          ],
          value: expect.anything(),
          manage: expect.anything(),
          expires_in: token.expiresIn
        }
      })
      expect(ctx.response).toSatisfyApiSpec()
    })

    test('Can rotate an expired token', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' },
          url: `/token/${token.id}`,
          method: 'POST'
        },
        { managementId }
      )

      await token.$query(trx).patch({ expiresIn: -1 })
      await accessTokenRoutes.rotate(ctx)
      expect(ctx.response.status).toBe(200)
      expect(ctx.response.get('Content-Type')).toBe(
        'application/json; charset=utf-8'
      )
      expect(ctx.body).toMatchObject({
        access_token: {
          access: [
            {
              type: access.type,
              actions: access.actions,
              limits: access.limits
            }
          ],
          value: expect.anything(),
          manage: expect.anything(),
          expires_in: token.expiresIn
        }
      })
      expect(ctx.response).toSatisfyApiSpec()
    })
  })
})
