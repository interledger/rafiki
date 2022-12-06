import { generateKeyPairSync } from 'crypto'
import { faker } from '@faker-js/faker'
import nock, { Definition } from 'nock'
import { URL } from 'url'
import { v4 as uuid } from 'uuid'
import {
  generateJwk,
  generateTestKeys,
  createHeaders
} from 'http-signature-utils'

import { createAuthMiddleware, httpsigMiddleware } from './middleware'
import { AccessType, AccessAction } from './grant'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices, HttpSigContext, PaymentPointerContext } from '../../app'
import { HttpMethod, RequestValidator } from 'openapi'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { setup } from '../payment_pointer/model.test'
import { TokenInfo, TokenInfoJSON } from './service'

type AppMiddleware = (
  ctx: PaymentPointerContext,
  next: () => Promise<void>
) => Promise<void>

type IntrospectionBody = {
  access_token: string
  resource_server: string
}

const next: jest.MockedFunction<() => Promise<void>> = jest.fn()
const token = 'OS9M2PMHKUR64TB8N6BW7OZB8CDFONP219RP1LT0'

describe('Auth Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let authServerIntrospectionUrl: URL
  let middleware: AppMiddleware
  let ctx: PaymentPointerContext
  let validateRequest: RequestValidator<IntrospectionBody>
  const key = {
    jwk: generateTestKeys().publicKey,
    proof: 'httpsig'
  }

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    authServerIntrospectionUrl = new URL(Config.authServerIntrospectionUrl)
    middleware = createAuthMiddleware({
      type: AccessType.IncomingPayment,
      action: AccessAction.Read
    })
    const { tokenIntrospectionSpec } = await deps.use('openApi')
    validateRequest = tokenIntrospectionSpec.createRequestValidator({
      path: '/introspect',
      method: HttpMethod.POST
    })
  })

  beforeEach(async (): Promise<void> => {
    ctx = setup({
      reqOpts: {
        headers: {
          Accept: 'application/json',
          Authorization: `GNAP ${token}`
        }
      },
      paymentPointer: await createPaymentPointer(deps)
    })
    ctx.container = deps
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  function mockAuthServer(
    grant: TokenInfoJSON | string | undefined = undefined
  ): nock.Scope {
    return nock(authServerIntrospectionUrl.origin)
      .post(
        authServerIntrospectionUrl.pathname,
        function (this: Definition, body) {
          validateRequest({
            ...this,
            body
          })
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
    scope.done()
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
      ],
      key
    })
    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 403,
      message: 'Insufficient Grant'
    })
    expect(next).not.toHaveBeenCalled()
    scope.done()
  })

  test.each`
    limitAccount
    ${false}
    ${true}
  `(
    'sets the context grant and calls next (limitAccount: $limitAccount)',
    async ({ limitAccount }): Promise<void> => {
      const tokenInfo = new TokenInfo(
        {
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
        },
        key
      )
      const scope = mockAuthServer(tokenInfo.toJSON())
      const next = jest.fn()
      await expect(middleware(ctx, next)).resolves.toBeUndefined()
      expect(next).toHaveBeenCalled()
      expect(ctx.grant).toEqual(tokenInfo)
      scope.done()
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
})

describe('HTTP Signature Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let ctx: HttpSigContext

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe.each`
    body              | description
    ${undefined}      | ${'without body'}
    ${{ id: uuid() }} | ${'with body'}
  `('$description', ({ body }): void => {
    beforeEach(async (): Promise<void> => {
      const method = body ? 'POST' : 'GET'
      const url = faker.internet.url()
      const keyId = uuid()
      const privateKey = generateKeyPairSync('ed25519').privateKey
      const request = {
        url,
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `GNAP ${token}`
        },
        body: JSON.stringify(body)
      }
      const requestSignatureHeaders = await createHeaders({
        request,
        privateKey,
        keyId
      })

      ctx = createContext<HttpSigContext>({
        headers: {
          Accept: 'application/json',
          Authorization: `GNAP ${token}`,
          ...requestSignatureHeaders
        },
        method,
        body,
        url
      })
      ctx.container = deps
      ctx.grant = new TokenInfo(
        {
          active: true,
          clientId: uuid(),
          grant: uuid(),
          access: [
            {
              type: AccessType.IncomingPayment,
              actions: [AccessAction.Read]
            }
          ]
        },
        {
          jwk: generateJwk({
            keyId,
            privateKey
          }),
          proof: 'httpsig'
        }
      )
    })

    test('calls next with valid http signature', async (): Promise<void> => {
      await expect(httpsigMiddleware(ctx, next)).resolves.toBeUndefined()
      expect(next).toHaveBeenCalled()
    })

    test('returns 401 for invalid http signature', async (): Promise<void> => {
      ctx.request.headers['signature'] = 'aaaaaaaaaa='
      await expect(httpsigMiddleware(ctx, next)).rejects.toMatchObject({
        status: 401,
        message: 'Invalid signature'
      })
      expect(next).not.toHaveBeenCalled()
    })

    test('returns 401 for invalid key type', async (): Promise<void> => {
      ctx.grant.key.jwk.kty = 'EC' as 'OKP'
      await expect(httpsigMiddleware(ctx, next)).rejects.toMatchObject({
        status: 401,
        message: 'Invalid signature'
      })
      expect(next).not.toHaveBeenCalled()
    })

    // TODO: remove with
    // https://github.com/interledger/rafiki/issues/737
    test.skip('returns 401 if any signature keyid does not match the jwk key id', async (): Promise<void> => {
      ctx.grant.key.jwk.kid = 'mismatched-key'
      await expect(httpsigMiddleware(ctx, next)).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      expect(next).not.toHaveBeenCalled()
    })

    if (body) {
      test('returns 401 if content-digest does not match the body', async (): Promise<void> => {
        ctx.request.headers['content-digest'] = 'aaaaaaaaaa='
        await expect(httpsigMiddleware(ctx, next)).rejects.toMatchObject({
          status: 401,
          message: 'Invalid signature'
        })
        expect(next).not.toHaveBeenCalled()
      })
    }
  })
})
