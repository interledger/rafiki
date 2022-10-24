import nock from 'nock'
import { Knex } from 'knex'
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
import { KID_PATH, KEY_REGISTRY_ORIGIN } from '../grant/routes.test'
import { generateTestKeys, TEST_CLIENT } from '../tests/signature'
import { ClientKey, JWKWithRequired } from '../client/service'

describe('Access Token Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let trx: Knex.Transaction
  let accessTokenRoutes: AccessTokenRoutes
  let testJwk: JWKWithRequired
  let keyId: string

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    accessTokenRoutes = await deps.use('accessTokenRoutes')
    const openApi = await deps.use('openApi')
    jestOpenAPI(openApi.authServerClientSpec)

    const keys = await generateTestKeys()
    testJwk = keys.publicKey
    keyId = keys.keyId
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  const BASE_GRANT = {
    state: GrantState.Pending,
    startMethod: [StartMethod.Redirect],
    continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
    continueId: v4(),
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com/finish',
    clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
    clientKeyId: KEY_REGISTRY_ORIGIN + KID_PATH,
    interactId: v4(),
    interactRef: crypto.randomBytes(8).toString('hex').toUpperCase(),
    interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
  }

  const BASE_ACCESS = {
    type: AccessType.OutgoingPayment,
    actions: [Action.Read, Action.Create],
    identifier: `https://example.com/${v4()}`,
    limits: {
      receiver: 'https://wallet.com/alice',
      sendAmount: {
        value: '400',
        assetCode: 'USD',
        assetScale: 2
      }
    }
  }

  const BASE_TOKEN = {
    value: crypto.randomBytes(8).toString('hex').toUpperCase(),
    managementId: v4(),
    expiresIn: 3600
  }

  describe('Introspect', (): void => {
    let grant: Grant
    let access: Access
    let token: AccessToken

    const url = '/introspect'
    const method = 'POST'

    beforeEach(async (): Promise<void> => {
      grant = await Grant.query(trx).insertAndFetch({
        ...BASE_GRANT,
        clientKeyId: testJwk.kid
      })
      access = await Access.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_ACCESS
      })
      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN
      })
    })
    test('Cannot introspect fake token', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json'
          },
          url,
          method
        },
        {}
      )
      ctx.request.body = {
        access_token: v4(),
        resource_server: 'test'
      }
      await expect(accessTokenRoutes.introspect(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(404)
      expect(ctx.body).toMatchObject({
        error: 'invalid_request',
        message: 'token not found'
      })
    })

    test('Successfully introspects valid token', async (): Promise<void> => {
      const clientId = crypto
        .createHash('sha256')
        .update(TEST_CLIENT.id)
        .digest('hex')

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get('/' + keyId)
        .reply(200, {
          client: TEST_CLIENT,
          jwk: {
            ...testJwk,
            exp: Math.floor(Date.now() / 1000) + 3600,
            nbf: Math.floor(Date.now() / 1000) - 3600,
            revoked: false
          }
        } as ClientKey)

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/introspect',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = {
        access_token: token.value,
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
            limits: access.limits,
            identifier: access.identifier
          }
        ],
        key: {
          proof: 'httpsig',
          jwk: {
            ...testJwk,
            exp: expect.any(Number),
            nbf: expect.any(Number),
            revoked: false
          }
        },
        client_id: clientId
      })
      scope.isDone()
    })

    test('Successfully introspects expired token', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(KID_PATH)
        .reply(200, {
          client: TEST_CLIENT,
          jwk: testJwk
        } as ClientKey)
      const tokenCreatedDate = new Date(token.createdAt)
      const now = new Date(
        tokenCreatedDate.getTime() + (token.expiresIn + 1) * 1000
      )
      jest.useFakeTimers({ now })

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/introspect',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = {
        access_token: token.value,
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

      scope.isDone()
    })
  })

  describe('Revocation', (): void => {
    let grant: Grant
    let token: AccessToken
    let managementId: string
    let url: string

    const method = 'DELETE'

    beforeEach(async (): Promise<void> => {
      grant = await Grant.query(trx).insertAndFetch({
        ...BASE_GRANT
      })
      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN
      })
      managementId = token.managementId
      url = `/token/${managementId}`
    })

    test('Returns status 204 even if token does not exist', async (): Promise<void> => {
      managementId = v4()
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json'
          },
          url: `/token/${managementId}`,
          method
        },
        { id: managementId }
      )

      await accessTokenRoutes.revoke(ctx)
      expect(ctx.response.status).toBe(204)
    })

    test('Returns status 204 if token has not expired', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(KID_PATH)
        .reply(200, {
          client: TEST_CLIENT,
          jwk: testJwk
        } as ClientKey)

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json'
          },
          url,
          method
        },
        { id: managementId }
      )

      ctx.request.body = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }
      await token.$query(trx).patch({ expiresIn: 10000 })
      await accessTokenRoutes.revoke(ctx)
      expect(ctx.response.status).toBe(204)
      scope.isDone()
    })

    test('Returns status 204 if token has expired', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(KID_PATH)
        .reply(200, {
          client: TEST_CLIENT,
          jwk: testJwk
        } as ClientKey)

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json'
          },
          url,
          method
        },
        { id: managementId }
      )

      ctx.request.body = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }
      await token.$query(trx).patch({ expiresIn: -1 })
      await accessTokenRoutes.revoke(ctx)
      expect(ctx.response.status).toBe(204)
      scope.isDone()
    })
  })

  describe('Rotation', (): void => {
    let grant: Grant
    let access: Access
    let token: AccessToken
    let managementId: string

    beforeEach(async (): Promise<void> => {
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
    })

    test('Cannot rotate nonexistent token', async (): Promise<void> => {
      managementId = v4()
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { id: managementId }
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
        { id: managementId }
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
        { id: managementId }
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
