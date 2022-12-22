import crypto from 'crypto'
import nock from 'nock'
import { faker } from '@faker-js/faker'
import { v4 } from 'uuid'
import { Knex } from 'knex'
import { JWK, generateTestKeys, TestKeys } from 'http-signature-utils'

import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { createContext, createContextWithSigHeaders } from '../tests/context'
import { Grant, GrantState, StartMethod, FinishMethod } from '../grant/model'
import { Access } from '../access/model'
import { AccessToken } from '../accessToken/model'
import { AccessType, Action } from '../access/types'
import {
  tokenHttpsigMiddleware,
  grantContinueHttpsigMiddleware,
  grantInitiationHttpsigMiddleware
} from './middleware'

describe('Signature Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  const CLIENT = faker.internet.url()
  let knex: Knex
  let testKeys: TestKeys
  let testClientKey: JWK

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    testKeys = generateTestKeys()
    testClientKey = testKeys.publicKey
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    appContainer.shutdown()
  })

  describe('Signature middleware', (): void => {
    let grant: Grant
    let token: AccessToken
    let trx: Knex.Transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let next: () => Promise<any>
    let managementId: string
    let tokenManagementUrl: string

    const BASE_GRANT = {
      state: GrantState.Pending,
      startMethod: [StartMethod.Redirect],
      continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
      continueId: v4(),
      finishMethod: FinishMethod.Redirect,
      finishUri: 'https://example.com/finish',
      clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
      client: CLIENT,
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

    beforeEach(async (): Promise<void> => {
      grant = await Grant.query(trx).insertAndFetch({
        ...BASE_GRANT,
        clientKeyId: testKeys.publicKey.kid
      })
      await Access.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_ACCESS
      })
      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next = jest.fn(async function (): Promise<any> {
        return null
      })

      managementId = token.managementId
      tokenManagementUrl = `/token/${managementId}`
    })

    afterEach(async (): Promise<void> => {
      jest.useRealTimers()
      await truncateTables(knex)
    })

    test('Validate grant initiation request with middleware', async (): Promise<void> => {
      const scope = nock(CLIENT)
        .get('/jwks.json')
        .reply(200, {
          keys: [testClientKey]
        })

      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json'
          },
          url: 'http://example.com/',
          method: 'POST'
        },
        {},
        {
          client: CLIENT
        },
        testKeys.privateKey,
        testKeys.publicKey.kid,
        deps
      )

      await grantInitiationHttpsigMiddleware(ctx, next)

      expect(ctx.response.status).toEqual(200)
      expect(ctx.clientKeyId).toEqual(testKeys.publicKey.kid)
      expect(next).toHaveBeenCalled()

      scope.done()
    })

    test('Validate grant continuation request with middleware', async (): Promise<void> => {
      const scope = nock(CLIENT)
        .get('/jwks.json')
        .reply(200, {
          keys: [testClientKey]
        })

      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json',
            Authorization: `GNAP ${grant.continueToken}`
          },
          url: 'http://example.com/continue',
          method: 'POST'
        },
        { id: grant.continueId },
        { interact_ref: grant.interactRef },
        testKeys.privateKey,
        testKeys.publicKey.kid,
        deps
      )

      await grantContinueHttpsigMiddleware(ctx, next)
      expect(ctx.response.status).toEqual(200)
      expect(ctx.clientKeyId).toEqual(testKeys.publicKey.kid)
      expect(next).toHaveBeenCalled()

      scope.done()
    })

    test('Validate token management request with middleware', async () => {
      const scope = nock(CLIENT)
        .get('/jwks.json')
        .reply(200, {
          keys: [testClientKey]
        })

      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json'
          },
          url: 'http://example.com' + tokenManagementUrl,
          method: 'DELETE'
        },
        { id: managementId },
        {
          access_token: token.value,
          proof: 'httpsig',
          resource_server: 'test'
        },
        testKeys.privateKey,
        testKeys.publicKey.kid,
        deps
      )

      await tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(200)
      expect(ctx.clientKeyId).toEqual(testKeys.publicKey.kid)

      scope.done()
    })

    test('httpsig middleware fails if headers are invalid', async () => {
      const method = 'DELETE'

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json'
          },
          url: 'http://example.com' + tokenManagementUrl,
          method
        },
        { id: managementId },
        deps
      )

      ctx.request.body = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }
      await expect(tokenHttpsigMiddleware(ctx, next)).rejects.toMatchObject({
        status: 400,
        error: 'invalid_request',
        message: 'invalid signature headers'
      })
    })

    test('middleware fails if signature is invalid', async (): Promise<void> => {
      const scope = nock(CLIENT)
        .get('/jwks.json')
        .reply(200, {
          keys: [testClientKey]
        })

      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json',
            Authorization: `GNAP ${grant.continueToken}`
          },
          url: '/continue',
          method: 'POST'
        },
        { id: grant.continueId },
        { interact_ref: grant.interactRef },
        testKeys.privateKey,
        testKeys.publicKey.kid,
        deps
      )

      ctx.headers['signature'] = 'wrong-signature'

      await expect(
        grantContinueHttpsigMiddleware(ctx, next)
      ).rejects.toHaveProperty('status', 401)

      scope.done()
    })

    test('middleware fails if client is invalid', async (): Promise<void> => {
      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {},
        {
          client: CLIENT
        },
        testKeys.privateKey,
        testKeys.publicKey.kid,
        deps
      )

      await expect(
        grantInitiationHttpsigMiddleware(ctx, next)
      ).rejects.toMatchObject({
        status: 400,
        message: 'invalid client'
      })
    })

    test('middleware fails if content-digest is invalid', async (): Promise<void> => {
      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {},
        {
          client: CLIENT
        },
        testKeys.privateKey,
        testKeys.publicKey.kid,
        deps
      )

      ctx.request.body = { test: 'this is wrong' }

      await expect(
        grantInitiationHttpsigMiddleware(ctx, next)
      ).rejects.toMatchObject({
        status: 400,
        message: 'invalid signature headers'
      })
    })
  })
})
