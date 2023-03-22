import { faker } from '@faker-js/faker'
import nock from 'nock'
import { Knex } from 'knex'
import { v4 } from 'uuid'
import jestOpenAPI from 'jest-openapi'

import { createContext, createTokenHttpSigContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { FinishMethod, Grant, GrantState, StartMethod } from '../grant/model'
import { AccessToken } from './model'
import { Access } from '../access/model'
import { AccessTokenRoutes, IntrospectContext } from './routes'
import { generateNonce, generateToken } from '../shared/utils'
import { AccessType, AccessAction } from '@interledger/open-payments'
import { GrantService } from '../grant/service'
import { AccessTokenService } from './service'

describe('Access Token Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let trx: Knex.Transaction
  let accessTokenRoutes: AccessTokenRoutes
  let accessTokenService: AccessTokenService
  let grantService: GrantService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    accessTokenRoutes = await deps.use('accessTokenRoutes')
    grantService = await deps.use('grantService')
    accessTokenService = await deps.use('accessTokenService')
    const openApi = await deps.use('openApi')
    jestOpenAPI(openApi.authServerSpec)
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  const CLIENT = faker.internet.url()

  const BASE_GRANT = {
    state: GrantState.Pending,
    startMethod: [StartMethod.Redirect],
    continueToken: generateToken(),
    continueId: v4(),
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com/finish',
    clientNonce: generateNonce(),
    client: CLIENT,
    interactId: v4(),
    interactRef: generateNonce(),
    interactNonce: generateNonce()
  }

  const BASE_ACCESS = {
    type: AccessType.OutgoingPayment,
    actions: [AccessAction.Read, AccessAction.Create, AccessAction.List],
    identifier: `https://example.com/${v4()}`,
    limits: {
      receiver:
        'https://wallet.com/alice/incoming-payments/12341234-1234-1234-1234-123412341234',
      sendAmount: {
        value: '400',
        assetCode: 'USD',
        assetScale: 2
      }
    }
  }

  const BASE_TOKEN = {
    value: generateToken(),
    managementId: v4(),
    expiresIn: Config.accessTokenExpirySeconds
  }

  describe('Introspect', (): void => {
    let grant: Grant
    let access: Access
    let token: AccessToken

    const url = '/'
    const method = 'POST'

    beforeEach(async (): Promise<void> => {
      grant = await Grant.query(trx).insertAndFetch(BASE_GRANT)
      access = await Access.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_ACCESS
      })
      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN
      })

      const openApi = await deps.use('openApi')
      jestOpenAPI(openApi.tokenIntrospectionSpec)
    })
    test('Cannot introspect fake token', async (): Promise<void> => {
      const ctx = createContext<IntrospectContext>(
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
        access_token: v4()
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

    test('Successfully introspects valid token', async (): Promise<void> => {
      const ctx = createContext<IntrospectContext>(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = {
        access_token: token.value
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
        client: CLIENT
      })
    })

    test('Successfully introspects expired token', async (): Promise<void> => {
      const tokenCreatedDate = new Date(token.createdAt)
      const now = new Date(
        tokenCreatedDate.getTime() + (token.expiresIn + 1) * 1000
      )
      jest.useFakeTimers({ now })

      const ctx = createContext<IntrospectContext>(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = {
        access_token: token.value
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

    beforeEach(async (): Promise<void> => {
      grant = await Grant.query(trx).insertAndFetch(BASE_GRANT)
      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN
      })
    })

    test('Returns status 204 even if token does not exist', async (): Promise<void> => {
      const ctx = createTokenHttpSigContext(token, grant)

      await token.$query(trx).delete()

      await accessTokenRoutes.revoke(ctx)
      expect(ctx.response.status).toBe(204)
    })

    test('Returns status 204 if token has not expired', async (): Promise<void> => {
      const ctx = createTokenHttpSigContext(token, grant)

      await token.$query(trx).patch({ expiresIn: 10000 })
      await accessTokenRoutes.revoke(ctx)
      expect(ctx.response.status).toBe(204)
    })

    test('Returns status 204 if token has expired', async (): Promise<void> => {
      const ctx = createTokenHttpSigContext(token, grant)

      await token.$query(trx).patch({ expiresIn: -1 })
      await accessTokenRoutes.revoke(ctx)
      expect(ctx.response.status).toBe(204)
    })
  })

  describe('Rotation', (): void => {
    let grant: Grant
    let access: Access
    let token: AccessToken

    beforeEach(async (): Promise<void> => {
      grant = await Grant.query(trx).insertAndFetch(BASE_GRANT)
      access = await Access.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_ACCESS
      })
      token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN
      })

      const openApi = await deps.use('openApi')
      jestOpenAPI(openApi.authServerSpec)
    })

    test('Can rotate token', async (): Promise<void> => {
      const ctx = createTokenHttpSigContext(token, grant)

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
          value: expect.any(String),
          manage: expect.any(String),
          expires_in: token.expiresIn
        }
      })
      expect(ctx.response).toSatisfyApiSpec()
    })

    test('Can rotate an expired token', async (): Promise<void> => {
      const ctx = createTokenHttpSigContext(token, grant)

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
          expires_in: Config.accessTokenExpirySeconds
        }
      })
      expect(ctx.response).toSatisfyApiSpec()
    })

    test('Locks grant during token rotation', async (): Promise<void> => {
      const ctx = createTokenHttpSigContext(token, grant)

      const grantLockSpy = jest.spyOn(grantService, 'lock')

      await accessTokenRoutes.rotate(ctx)

      expect(grantLockSpy).toHaveBeenCalledTimes(1)
      expect(grantLockSpy).toHaveBeenCalledWith(
        token.grantId,
        expect.anything()
      )
    })

    test('Returns status 400 if could not rotate token', async (): Promise<void> => {
      const ctx = createTokenHttpSigContext(token, grant)
      jest.spyOn(accessTokenService, 'rotate').mockResolvedValueOnce(undefined)

      await expect(accessTokenRoutes.rotate(ctx)).rejects.toMatchObject({
        status: 400,
        message: 'Could not rotate token'
      })
    })
  })
})
