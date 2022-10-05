import assert from 'assert'
import nock, { Definition } from 'nock'
import { URL } from 'url'
import { v4 as uuid } from 'uuid'

import { createAuthMiddleware } from './middleware'
import { Grant, GrantJSON, AccessType, AccessAction } from './grant'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices, PaymentPointerContext } from '../../app'
import { HttpMethod, ValidateFunction } from 'openapi'
import { setup } from '../../shared/routes.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'
import { GrantReference } from '../grantReference/model'
import { GrantReferenceService } from '../grantReference/service'
import { httpis } from 'http-message-signatures'
import { JWKWithRequired } from 'auth'
import { TokenInfo } from './service'

type AppMiddleware = (
  ctx: PaymentPointerContext,
  next: () => Promise<void>
) => Promise<void>

type IntrospectionBody = {
  access_token: string
  resource_server: string
}

describe('Auth Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let authServerIntrospectionUrl: URL
  let middleware: AppMiddleware
  let ctx: PaymentPointerContext
  let next: jest.MockedFunction<() => Promise<void>>
  let validateRequest: ValidateFunction<IntrospectionBody>
  let grantReferenceService: GrantReferenceService
  const token = 'OS9M2PMHKUR64TB8N6BW7OZB8CDFONP219RP1LT0'

  function buildSignatureInputHeader(
    signatureName: string,
    parameters?: {
      created?: number
      keyid?: string
      alg?: string
    }
  ): string {
    return (
      signatureName +
      httpis.buildSignatureInputString(
        [
          '@method',
          '@target-uri',
          'content-digest',
          'content-length',
          'content-type',
          'authorization'
        ],
        {
          created: (parameters && parameters.created) || 1618884473,
          keyid: (parameters && parameters.keyid) || 'gnap-key'
        }
      )
    )
  }

  async function mockIntrospect(
    grant: Grant,
    jwk?: Partial<JWKWithRequired>
  ): Promise<void> {
    const authService = await deps.use('authService')
    jest.spyOn(authService, 'introspect').mockImplementation(async () => {
      return new TokenInfo(grant, {
        jwk: {
          alg: (jwk && jwk.alg) || 'ed25519',
          kty: (jwk && jwk.kty) || 'OKP',
          crv: (jwk && jwk.crv) || 'Ed25519',
          x: (jwk && jwk.x) || '051208da-f6b6-4ed0-b49b-8b0043900eee',
          kid: (jwk && jwk.kid) || 'gnap-key'
        },
        proof: 'httpsig'
      })
    })
  }

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    authServerIntrospectionUrl = new URL(Config.authServerIntrospectionUrl)
    middleware = createAuthMiddleware({
      type: AccessType.IncomingPayment,
      action: AccessAction.Read
    })
    const authOpenApi = await deps.use('authOpenApi')
    validateRequest = authOpenApi.createRequestValidator({
      path: '/introspect',
      method: HttpMethod.POST
    })
    grantReferenceService = await deps.use('grantReferenceService')
  })

  beforeEach(async (): Promise<void> => {
    ctx = setup({
      reqOpts: {
        headers: {
          Accept: 'application/json',
          Authorization: `GNAP ${token}`,
          Signature: 'sig1=:aGVsbG8=:',
          'Signature-Input': buildSignatureInputHeader('sig1')
        }
      },
      paymentPointer: await createPaymentPointer(deps)
    })
    ctx.container = deps
    next = jest.fn()
  })

  afterAll(async (): Promise<void> => {
    await truncateTables(await deps.use('knex'))
    await appContainer.shutdown()
  })

  function mockAuthServer(
    grant: GrantJSON | string | undefined = undefined
  ): nock.Scope {
    return nock(authServerIntrospectionUrl.origin)
      .post(
        authServerIntrospectionUrl.pathname,
        function (this: Definition, body) {
          assert.ok(
            validateRequest({
              ...this,
              body
            })
          )
          expect(body.access_token).toEqual(token)
          return true
        }
      )
      .reply(grant ? 200 : 404, grant)
  }

  test.each`
    authorization             | description
    ${undefined}              | ${'missing'}
    ${'Bearer NOT-GNAP'}      | ${'invalid'}
    ${'GNAP'}                 | ${'missing'}
    ${'GNAP multiple tokens'} | ${'invalid'}
  `(
    'returns 401 for $description access token',
    async ({ authorization }): Promise<void> => {
      ctx.request.headers.authorization = authorization
      await expect(middleware(ctx, next)).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      expect(ctx.message).toEqual('Unauthorized')
      expect(ctx.response.get('WWW-Authenticate')).toBe(
        `GNAP as_uri=${Config.authServerGrantUrl}`
      )
      expect(next).not.toHaveBeenCalled()
    }
  )

  const inactiveGrant = {
    active: false,
    grant: uuid()
  }

  test.each`
    grant            | description
    ${undefined}     | ${'unknown token/grant'}
    ${'bad grant'}   | ${'invalid grant'}
    ${inactiveGrant} | ${'inactive grant'}
  `('Returns 401 for $description', async ({ grant }): Promise<void> => {
    const scope = mockAuthServer(grant)
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.status).toBe(401)
    expect(ctx.message).toEqual('Invalid Token')
    expect(ctx.response.get('WWW-Authenticate')).toBe(
      `GNAP as_uri=${Config.authServerGrantUrl}`
    )
    expect(next).not.toHaveBeenCalled()
    scope.isDone()
  })

  test('returns 403 for unauthorized request', async (): Promise<void> => {
    const scope = mockAuthServer({
      active: true,
      client_id: uuid(),
      grant: uuid(),
      access: [
        {
          type: AccessType.OutgoingPayment,
          actions: [AccessAction.Create],
          identifier: ctx.paymentPointer.url
        }
      ]
    })
    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 403,
      message: 'Insufficient Grant'
    })
    expect(next).not.toHaveBeenCalled()
    scope.isDone()
  })
  test('returns 500 for not matching clientId', async (): Promise<void> => {
    const grant = new Grant({
      active: true,
      clientId: uuid(),
      grant: uuid(),
      access: [
        {
          type: AccessType.IncomingPayment,
          actions: [AccessAction.Read],
          identifier: ctx.paymentPointer.url
        }
      ]
    })
    await grantReferenceService.create({
      id: grant.grant,
      clientId: uuid()
    })
    const scope = mockAuthServer(grant.toJSON())
    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 500
    })
    expect(next).not.toHaveBeenCalled()
    scope.isDone()
  })

  test.each`
    limitAccount
    ${false}
    ${true}
  `(
    'sets the context grant and calls next (limitAccount: $limitAccount)',
    async ({ limitAccount }): Promise<void> => {
      const grant = new Grant({
        active: true,
        clientId: uuid(),
        grant: uuid(),
        access: [
          {
            type: AccessType.IncomingPayment,
            actions: [AccessAction.Read],
            identifier: limitAccount ? ctx.paymentPointer.url : undefined
          },
          {
            type: AccessType.OutgoingPayment,
            actions: [AccessAction.Create, AccessAction.Read],
            identifier: ctx.paymentPointer.url,
            interval: 'R/2022-03-01T13:00:00Z/P1M',
            limits: {
              receiveAmount: {
                value: BigInt(500),
                assetCode: 'EUR',
                assetScale: 2
              },
              sendAmount: {
                value: BigInt(811),
                assetCode: 'USD',
                assetScale: 2
              },
              receiver:
                'https://wallet2.example/bob/incoming-payments/aa9da466-12ba-4760-9aa0-8c06061f333b'
            }
          }
        ]
      })
      const scope = mockAuthServer(grant.toJSON())
      const next = jest.fn().mockImplementation(async () => {
        await expect(
          GrantReference.query().findById(grant.grant)
        ).resolves.toEqual({
          id: grant.grant,
          clientId: grant.clientId
        })
      })
      await expect(middleware(ctx, next)).resolves.toBeUndefined()
      expect(next).toHaveBeenCalled()
      expect(ctx.grant).toEqual(grant)
      scope.isDone()
    }
  )
  test('bypasses token introspection for configured DEV_ACCESS_TOKEN', async (): Promise<void> => {
    ctx.headers.authorization = `GNAP ${Config.devAccessToken}`
    const authService = await deps.use('authService')
    const introspectSpy = jest.spyOn(authService, 'introspect')
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(introspectSpy).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  test('sets the context and calls next if grant has been seen before', async (): Promise<void> => {
    const grant = new Grant({
      active: true,
      clientId: uuid(),
      grant: uuid(),
      access: [
        {
          type: AccessType.IncomingPayment,
          actions: [AccessAction.Read],
          identifier: ctx.paymentPointer.url
        }
      ]
    })
    await grantReferenceService.create({
      id: grant.grant,
      clientId: grant.clientId
    })
    const scope = mockAuthServer(grant.toJSON())
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalled()
    expect(ctx.grant).toEqual(grant)
    scope.isDone()
  })

  test('returns 200 with valid http signature', async (): Promise<void> => {
    Config.skipSignatureVerification = false
    ctx.request.headers['signature'] = 'sig1=:aGVsbG8=:'
    ctx.request.headers['signature-input'] =
      'sig1=("@method" "@target-uri" "content-digest" "content-length" "content-type" "authorization");created=1618884473;keyid="gnap-key"'
    ctx.request.headers['content-digest'] = 'sha-256=:test-hash:'
    ctx.request.headers['content-length'] = '1234'
    const grant = new Grant({
      active: true,
      clientId: uuid(),
      grant: uuid(),
      access: [
        {
          type: AccessType.IncomingPayment,
          actions: [AccessAction.Read],
          identifier: ctx.paymentPointer.url
        }
      ]
    })
    await grantReferenceService.create({
      id: grant.grant,
      clientId: grant.clientId
    })
    const scope = mockAuthServer(grant.toJSON())
    await mockIntrospect(grant)
    await expect(middleware(ctx, next)).resolves.not.toThrow()
    expect(next).toHaveBeenCalled()
    scope.done()
  })

  test('returns 401 for invalid key type', async (): Promise<void> => {
    Config.skipSignatureVerification = false
    const grant = new Grant({
      active: true,
      clientId: uuid(),
      grant: uuid(),
      access: [
        {
          type: AccessType.IncomingPayment,
          actions: [AccessAction.Read],
          identifier: ctx.paymentPointer.url
        }
      ]
    })
    await grantReferenceService.create({
      id: grant.grant,
      clientId: grant.clientId
    })
    const scope = mockAuthServer(grant.toJSON())
    await mockIntrospect(grant, {
      kty: 'EC'
    })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.status).toBe(401)
    expect(next).not.toHaveBeenCalled()
    scope.isDone()
  })

  test('returns 401 if signature header is missing', async (): Promise<void> => {
    Config.skipSignatureVerification = false
    const grant = new Grant({
      active: true,
      clientId: uuid(),
      grant: uuid(),
      access: [
        {
          type: AccessType.IncomingPayment,
          actions: [AccessAction.Read],
          identifier: ctx.paymentPointer.url
        }
      ]
    })
    await grantReferenceService.create({
      id: grant.grant,
      clientId: grant.clientId
    })
    const scope = mockAuthServer(grant.toJSON())
    delete ctx.request.headers['signature']
    await mockIntrospect(grant)
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.status).toBe(401)
    expect(next).not.toHaveBeenCalled()
    scope.isDone()
  })

  test('returns 401 if signature-input header is missing', async (): Promise<void> => {
    Config.skipSignatureVerification = false
    const grant = new Grant({
      active: true,
      clientId: uuid(),
      grant: uuid(),
      access: [
        {
          type: AccessType.IncomingPayment,
          actions: [AccessAction.Read],
          identifier: ctx.paymentPointer.url
        }
      ]
    })
    await grantReferenceService.create({
      id: grant.grant,
      clientId: grant.clientId
    })
    const scope = mockAuthServer(grant.toJSON())
    delete ctx.request.headers['signature-input']
    await mockIntrospect(grant)
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.status).toBe(401)
    expect(next).not.toHaveBeenCalled()
    scope.isDone()
  })

  test('returns 401 if any signature keyid does not match the jwk key id', async (): Promise<void> => {
    Config.skipSignatureVerification = false
    const grant = new Grant({
      active: true,
      clientId: uuid(),
      grant: uuid(),
      access: [
        {
          type: AccessType.IncomingPayment,
          actions: [AccessAction.Read],
          identifier: ctx.paymentPointer.url
        }
      ]
    })
    await grantReferenceService.create({
      id: grant.grant,
      clientId: grant.clientId
    })
    const scope = mockAuthServer(grant.toJSON())
    ctx.request.headers['signature'] = 'sig1=:aGVsbG8=:'
    ctx.request.headers['signature-input'] =
      'sig1=("@method" "@target-uri" "content-digest" "content-length" "content-type" "authorization");created=1618884473;keyid="051208daf6b64ed0b49b8b00439003bc"'
    await mockIntrospect(grant)
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.status).toBe(401)
    expect(next).not.toHaveBeenCalled()
    scope.isDone()
  })
})
