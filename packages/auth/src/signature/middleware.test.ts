import crypto from 'crypto'
import nock from 'nock'
import { faker } from '@faker-js/faker'
import { v4 } from 'uuid'
import {
  JWK,
  generateTestKeys,
  TestKeys
} from '@interledger/http-signature-utils'

import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { createContext, createContextWithSigHeaders } from '../tests/context'
import {
  Grant,
  GrantState,
  GrantFinalization,
  StartMethod,
  FinishMethod
} from '../grant/model'
import { Access } from '../access/model'
import { AccessToken } from '../accessToken/model'
import {
  tokenHttpsigMiddleware,
  grantContinueHttpsigMiddleware,
  grantInitiationHttpsigMiddleware
} from './middleware'
import { AccessTokenService } from '../accessToken/service'
import { AccessType, AccessAction } from '@interledger/open-payments'
import { ContinueContext, CreateContext } from '../grant/routes'
import { Interaction, InteractionState } from '../interaction/model'
import { generateNonce } from '../shared/utils'
import { GNAPErrorCode } from '../shared/gnapErrors'
import { TransactionOrKnex } from 'objection'
import { Tenant } from '../tenant/model'
import { generateTenant } from '../tests/tenant'

describe('Signature Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  const CLIENT = faker.internet.url({ appendSlash: false })
  let testKeys: TestKeys
  let testClientKey: JWK

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    testKeys = generateTestKeys()
    testClientKey = testKeys.publicKey
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  describe('Signature middleware', (): void => {
    let grant: Grant
    let interaction: Interaction
    let token: AccessToken
    let trx: TransactionOrKnex
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let next: () => Promise<any>
    let managementId: string
    let tokenManagementUrl: string
    let accessTokenService: AccessTokenService
    let tenant: Tenant

    beforeAll(async (): Promise<void> => {
      trx = appContainer.knex
    })

    const generateBaseGrant = (overrides?: Partial<Grant>) => ({
      state: GrantState.Pending,
      startMethod: [StartMethod.Redirect],
      continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
      continueId: v4(),
      finishMethod: FinishMethod.Redirect,
      finishUri: 'https://example.com/finish',
      clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
      client: CLIENT,
      ...overrides
    })

    const generateBaseInteraction = (grant: Grant) => ({
      ref: v4(),
      nonce: generateNonce(),
      state: InteractionState.Pending,
      grantId: grant.id,
      expiresIn: Config.interactionExpirySeconds
    })

    const BASE_ACCESS = {
      type: AccessType.OutgoingPayment,
      actions: [AccessAction.Read, AccessAction.Create],
      identifier: `https://example.com/${v4()}`,
      limits: {
        receiver: 'https://wallet.com/alice',
        debitAmount: {
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

    beforeAll(async (): Promise<void> => {
      accessTokenService = await deps.use('accessTokenService')
    })

    beforeEach(async (): Promise<void> => {
      tenant = await Tenant.query(trx).insertAndFetch(generateTenant())
      grant = await Grant.query(trx).insertAndFetch(
        generateBaseGrant({ tenantId: tenant.id })
      )
      await Access.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_ACCESS
      })
      interaction = await Interaction.query(trx).insertAndFetch(
        generateBaseInteraction(grant)
      )
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
      await truncateTables(deps)
    })

    test('Validate grant initiation request with middleware', async (): Promise<void> => {
      const scope = nock(CLIENT)
        .get('/jwks.json')
        .reply(200, {
          keys: [testClientKey]
        })

      const ctx = await createContextWithSigHeaders<CreateContext>(
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
      expect(next).toHaveBeenCalled()

      scope.done()
    })

    test('Validate grant continuation request with middleware', async (): Promise<void> => {
      const scope = nock(CLIENT)
        .get('/jwks.json')
        .reply(200, {
          keys: [testClientKey]
        })

      const ctx = await createContextWithSigHeaders<ContinueContext>(
        {
          headers: {
            Accept: 'application/json',
            Authorization: `GNAP ${grant.continueToken}`
          },
          url: 'http://example.com/continue',
          method: 'POST'
        },
        { id: grant.continueId },
        { interact_ref: interaction.ref },
        testKeys.privateKey,
        testKeys.publicKey.kid,
        deps
      )

      await grantContinueHttpsigMiddleware(ctx, next)
      expect(ctx.response.status).toEqual(200)
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
      expect(ctx.accessToken).toMatchObject({
        ...token,
        grant
      })

      scope.done()
    })

    test('token management request fails if grant cannot be found', async () => {
      const tokenWithoutGrant = token.$clone()
      tokenWithoutGrant.grant = undefined

      const tokenSpy = jest
        .spyOn(accessTokenService, 'getByManagementId')
        .mockResolvedValueOnce(tokenWithoutGrant)

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

      await expect(tokenHttpsigMiddleware(ctx, next)).rejects.toMatchObject({
        status: 500,
        code: GNAPErrorCode.RequestDenied,
        message: 'internal server error'
      })
      expect(tokenSpy).toHaveBeenCalledWith(managementId)
      expect(next).not.toHaveBeenCalled()
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
        status: 401,
        code: GNAPErrorCode.InvalidClient,
        message: 'invalid signature headers'
      })
    })

    test('middleware fails if signature is invalid', async (): Promise<void> => {
      const scope = nock(CLIENT)
        .get('/jwks.json')
        .reply(200, {
          keys: [testClientKey]
        })

      const ctx = await createContextWithSigHeaders<ContinueContext>(
        {
          headers: {
            Accept: 'application/json',
            Authorization: `GNAP ${grant.continueToken}`
          },
          url: '/continue',
          method: 'POST'
        },
        { id: grant.continueId },
        { interact_ref: interaction.ref },
        testKeys.privateKey,
        testKeys.publicKey.kid,
        deps
      )

      ctx.headers['signature'] = 'wrong-signature'

      await expect(
        grantContinueHttpsigMiddleware(ctx, next)
      ).rejects.toMatchObject({
        status: 401,
        code: GNAPErrorCode.InvalidClient,
        message: 'invalid signature'
      })

      scope.done()
    })

    test('middleware fails if grant is revoked', async (): Promise<void> => {
      const grant = await Grant.query().insert(
        generateBaseGrant({
          tenantId: tenant.id,
          state: GrantState.Finalized,
          finalizationReason: GrantFinalization.Revoked
        })
      )

      const ctx = await createContextWithSigHeaders<ContinueContext>(
        {
          headers: {
            Accept: 'application/json',
            Authorization: `GNAP ${grant.continueToken}`
          },
          url: 'http://example.com/continue',
          method: 'POST'
        },
        { id: grant.continueId },
        { interact_ref: interaction.ref },
        testKeys.privateKey,
        testKeys.publicKey.kid,
        deps
      )

      await expect(
        grantContinueHttpsigMiddleware(ctx, next)
      ).rejects.toMatchObject({
        status: 401,
        code: GNAPErrorCode.InvalidContinuation,
        message: 'invalid grant'
      })
    })

    test('middleware fails if client is invalid', async (): Promise<void> => {
      const ctx = await createContextWithSigHeaders<CreateContext>(
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
        code: GNAPErrorCode.InvalidClient,
        message: 'could not determine client'
      })
    })

    test('middleware fails if content-digest is invalid', async (): Promise<void> => {
      const ctx = await createContextWithSigHeaders<CreateContext>(
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.request.body = { test: 'this is wrong' } as any

      await expect(
        grantInitiationHttpsigMiddleware(ctx, next)
      ).rejects.toMatchObject({
        status: 401,
        code: GNAPErrorCode.InvalidClient,
        message: 'invalid signature headers'
      })
    })
  })
})
