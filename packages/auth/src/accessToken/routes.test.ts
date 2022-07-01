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
import {
  generateSigHeaders,
  SIGNATURE_METHOD,
  SIGNATURE_TARGET_URI
} from '../tests/signature'
import {
  TEST_KID_PATH,
  KEY_REGISTRY_ORIGIN,
  TEST_CLIENT_KEY
} from '../grant/routes.test'

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
      const requestBody = {
        access_token: v4(),
        proof: 'httpsig',
        resource_server: 'test'
      }
      const { signature, sigInput, contentDigest } = await generateSigHeaders(
        requestBody
      )
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Digest': contentDigest,
            Signature: signature,
            'Signature-Input': sigInput
          },
          url: '/introspect',
          method: 'POST'
        },
        {}
      )
      ctx.request.body = requestBody
      ctx.method = SIGNATURE_METHOD
      ctx.request.url = SIGNATURE_TARGET_URI
      await expect(accessTokenRoutes.introspect(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(404)
      expect(ctx.body).toMatchObject({
        error: 'invalid_client',
        message: 'token not found'
      })
    })

    test('Cannot introspect if no token passed', async (): Promise<void> => {
      const requestBody = {
        proof: 'httpsig',
        resource_server: 'test'
      }

      const { signature, sigInput, contentDigest } = await generateSigHeaders(
        requestBody
      )
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Digest': contentDigest,
            Signature: signature,
            'Signature-Input': sigInput
          },
          url: '/introspect',
          method: 'POST'
        },
        {}
      )
      ctx.request.body = requestBody
      ctx.method = SIGNATURE_METHOD
      ctx.request.url = SIGNATURE_TARGET_URI
      await expect(accessTokenRoutes.introspect(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(400)
      expect(ctx.body).toEqual({
        error: 'invalid_request',
        message: 'invalid introspection request'
      })
    })

    test('Successfully introspects valid token', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          keys: [TEST_CLIENT_KEY.jwk]
        })

      const requestBody = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }

      const { signature, sigInput, contentDigest } = await generateSigHeaders(
        requestBody
      )
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Digest': contentDigest,
            Signature: signature,
            'Signature-Input': sigInput
          },
          url: '/introspect',
          method: 'POST'
          // method: SIGNATURE_METHOD,
          // url: SIGNATURE_TARGET_URI
        },
        {}
      )

      ctx.request.body = requestBody
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
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_CLIENT_KEY.jwk,
            nbf: expect.any(Number),
            exp: expect.any(Number),
            revoked: false
          }
        }
      })
      scope.isDone()
    })

    test('Successfully introspects expired token', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          keys: [TEST_CLIENT_KEY.jwk]
        })
      const requestBody = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }

      const { signature, sigInput, contentDigest } = await generateSigHeaders(
        requestBody
      )
      jest.useFakeTimers({
        doNotFake: ['nextTick'],
        now: new Date(new Date().getTime() + 4000)
      })
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Digest': contentDigest,
            Signature: signature,
            'Signature-Input': sigInput
          },
          url: '/introspect',
          method: 'POST'
          // method: SIGNATURE_METHOD,
          // url: SIGNATURE_TARGET_URI
        },
        {}
      )

      ctx.request.body = requestBody
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

    beforeEach(
      async (): Promise<void> => {
        grant = await Grant.query(trx).insertAndFetch({
          ...BASE_GRANT
        })
        token = await AccessToken.query(trx).insertAndFetch({
          grantId: grant.id,
          ...BASE_TOKEN
        })
        managementId = token.managementId
      }
    )

    test('Returns status 404 if token does not exist', async (): Promise<void> => {
      managementId = v4()

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          keys: [TEST_CLIENT_KEY.jwk]
        })

      const requestBody = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }

      const { signature, sigInput, contentDigest } = await generateSigHeaders()
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Digest': contentDigest,
            Signature: signature,
            'Signature-Input': sigInput
          },
          url: `/token/${managementId}`,
          method: 'DELETE'
        },
        { managementId }
      )

      ctx.request.body = requestBody

      await expect(accessTokenRoutes.revoke(ctx)).rejects.toMatchObject({
        status: 404,
        message: 'token not found'
      })

      scope.isDone()
    })

    test('Returns status 204 if token has not expired', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          keys: [TEST_CLIENT_KEY.jwk]
        })

      const requestBody = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }
      const { signature, sigInput, contentDigest } = await generateSigHeaders()
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Digest': contentDigest,
            Signature: signature,
            'Signature-Input': sigInput
          },
          url: `/token/${managementId}`,
          method: 'DELETE'
        },
        { managementId }
      )

      ctx.method = SIGNATURE_METHOD
      ctx.request.url = SIGNATURE_TARGET_URI
      ctx.request.body = requestBody
      await token.$query(trx).patch({ expiresIn: 10000 })
      await accessTokenRoutes.revoke(ctx)
      expect(ctx.response.status).toBe(204)
      scope.isDone()
    })

    test('Returns status 204 if token has expired', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          keys: [TEST_CLIENT_KEY.jwk]
        })

      const requestBody = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }
      const { signature, sigInput, contentDigest } = await generateSigHeaders()
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Digest': contentDigest,
            Signature: signature,
            'Signature-Input': sigInput
          },
          url: `/token/${managementId}`,
          method: 'DELETE'
        },
        { managementId }
      )

      ctx.method = SIGNATURE_METHOD
      ctx.request.url = SIGNATURE_TARGET_URI
      ctx.request.body = requestBody
      await token.$query(trx).patch({ expiresIn: -1 })
      await accessTokenRoutes.revoke(ctx)
      expect(ctx.response.status).toBe(204)
      scope.isDone()
    })
  })
})
