import { generateKeyPairSync } from 'crypto'
import { faker } from '@faker-js/faker'
import { Client, ActiveTokenInfo, TokenInfo } from 'token-introspection'
import { v4 as uuid } from 'uuid'
import {
  generateJwk,
  createHeaders,
  JWK
} from '@interledger/http-signature-utils'

import {
  authenticatedStatusMiddleware,
  createTokenIntrospectionMiddleware,
  httpsigMiddleware
} from './middleware'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import {
  AppServices,
  HttpSigContext,
  HttpSigWithAuthenticatedStatusContext,
  WalletAddressUrlContext
} from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'
import { createWalletAddress } from '../../tests/walletAddress'
import { setup } from '../wallet_address/model.test'
import { parseLimits } from '../payment/outgoing/limits'
import { AccessAction, AccessType } from '@interledger/open-payments'
import { OpenPaymentsServerRouteError } from '../route-errors'
import assert from 'assert'

const nock = (global as unknown as { nock: typeof import('nock') }).nock

type AppMiddleware = (
  ctx: WalletAddressUrlContext,
  next: () => Promise<void>
) => Promise<void>

const next: jest.MockedFunction<() => Promise<void>> = jest.fn()
const token = 'OS9M2PMHKUR64TB8N6BW7OZB8CDFONP219RP1LT0'

type IntrospectionCallObject = {
  access_token: string
  access: {
    type: AccessType
    actions: AccessAction[]
    identifier: string
  }[]
}

describe('Auth Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let middleware: AppMiddleware
  let ctx: WalletAddressUrlContext
  let tokenIntrospectionClient: Client

  const type = AccessType.IncomingPayment
  const action: AccessAction = 'create'

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    middleware = createTokenIntrospectionMiddleware({
      requestType: type,
      requestAction: action
    })
    tokenIntrospectionClient = await deps.use('tokenIntrospectionClient')
  })

  beforeEach(async (): Promise<void> => {
    ctx = setup({
      reqOpts: {
        headers: {
          Accept: 'application/json',
          Authorization: `GNAP ${token}`
        }
      },
      walletAddress: await createWalletAddress(deps)
    })
    ctx.container = deps
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('canSkipAuthValidation option', (): void => {
    test('calls next for undefined authorization header', async (): Promise<void> => {
      const middleware = createTokenIntrospectionMiddleware({
        requestType: type,
        requestAction: action,
        canSkipAuthValidation: true
      })
      ctx.request.headers.authorization = undefined

      await expect(middleware(ctx, next)).resolves.toBeUndefined()
      expect(ctx.response.get('WWW-Authenticate')).toBeFalsy()
      expect(next).toHaveBeenCalled()
    })

    test('throws error for unknown errors', async (): Promise<void> => {
      const middleware = createTokenIntrospectionMiddleware({
        requestType: AccessType.OutgoingPayment,
        requestAction: action,
        canSkipAuthValidation: true
      })

      jest.spyOn(tokenIntrospectionClient, 'introspect').mockResolvedValueOnce({
        active: true,
        access: [
          {
            type: AccessType.OutgoingPayment,
            actions: [action],
            limits: {
              debitAmount: {
                value: 'invalid_value'
              }
            }
          }
        ]
      } as TokenInfo) // causes an error other than OpenPaymentsServerRouteError

      expect.assertions(3)

      try {
        await middleware(ctx, next)
      } catch (err) {
        assert(err instanceof Error)
        assert(!(err instanceof OpenPaymentsServerRouteError))
        expect(err.message).toBe('Cannot convert invalid_value to a BigInt')
      }

      expect(ctx.response.get('WWW-Authenticate')).not.toBe(
        `GNAP as_uri=${Config.authServerGrantUrl}`
      )
      expect(next).not.toHaveBeenCalled()
    })

    test('proceeds with validation when authorization header exists, even with canSkipAuthValidation true', async (): Promise<void> => {
      const middleware = createTokenIntrospectionMiddleware({
        requestType: type,
        requestAction: action,
        canSkipAuthValidation: true
      })
      ctx.request.headers.authorization = 'GNAP valid_token'
      jest.spyOn(tokenIntrospectionClient, 'introspect').mockResolvedValueOnce({
        active: true,
        access: [{ type: type, actions: [action] }],
        client: 'test-client'
      } as TokenInfo)

      await middleware(ctx, next)

      expect(tokenIntrospectionClient.introspect).toHaveBeenCalled()
      expect(ctx.client).toBe('test-client')
      expect(next).toHaveBeenCalled()
    })

    test('throws OpenPaymentsServerRouteError for invalid token with skipAuthValidation true', async (): Promise<void> => {
      const middleware = createTokenIntrospectionMiddleware({
        requestType: type,
        requestAction: action,
        canSkipAuthValidation: true
      })
      ctx.request.headers.authorization = 'GNAP invalid_token'
      jest
        .spyOn(tokenIntrospectionClient, 'introspect')
        .mockRejectedValueOnce(new Error())

      await expect(middleware(ctx, next)).rejects.toThrow(
        OpenPaymentsServerRouteError
      )
      expect(ctx.response.get('WWW-Authenticate')).toBe(
        `GNAP as_uri=${Config.authServerGrantUrl}`
      )
      expect(next).not.toHaveBeenCalled()
    })

    test('throws OpenPaymentsServerRouteError when canSkipAuthValidation is false and no authorization header', async (): Promise<void> => {
      const middleware = createTokenIntrospectionMiddleware({
        requestType: type,
        requestAction: action,
        canSkipAuthValidation: false
      })
      ctx.request.headers.authorization = ''

      await expect(middleware(ctx, next)).rejects.toThrow(
        OpenPaymentsServerRouteError
      )
      expect(ctx.response.get('WWW-Authenticate')).toBe(
        `GNAP as_uri=${Config.authServerGrantUrl}`
      )
      expect(next).not.toHaveBeenCalled()
    })
  })

  test.each`
    authorization             | description
    ${undefined}              | ${'missing'}
    ${'Bearer NOT-GNAP'}      | ${'non-GNAP'}
    ${'GNAP'}                 | ${'missing token'}
    ${'GNAP multiple tokens'} | ${'invalid'}
  `(
    'returns 401 for $description authorization header value',
    async ({ authorization }): Promise<void> => {
      const introspectSpy = jest.spyOn(tokenIntrospectionClient, 'introspect')
      ctx.request.headers.authorization = authorization

      expect.assertions(5)
      try {
        await middleware(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(401)
        expect(err.message).toEqual(
          'Missing or invalid authorization header value'
        )
      }
      expect(introspectSpy).not.toHaveBeenCalled()
      expect(ctx.response.get('WWW-Authenticate')).toBe(
        `GNAP as_uri=${Config.authServerGrantUrl}`
      )
      expect(next).not.toHaveBeenCalled()
    }
  )

  test('returns 401 for unsuccessful token introspection', async (): Promise<void> => {
    const introspectSpy = jest
      .spyOn(tokenIntrospectionClient, 'introspect')
      .mockImplementation(() => {
        throw new Error('test error')
      })

    expect.assertions(5)
    try {
      await middleware(ctx, next)
    } catch (err) {
      assert(err instanceof OpenPaymentsServerRouteError)
      expect(err.status).toBe(401)
      expect(err.message).toEqual('Invalid Token')
    }

    expect(introspectSpy).toHaveBeenCalledWith({
      access_token: token,
      access: [
        {
          type: type,
          actions: [action],
          identifier: ctx.walletAddressUrl
        }
      ]
    })
    expect(ctx.response.get('WWW-Authenticate')).toBe(
      `GNAP as_uri=${Config.authServerGrantUrl}`
    )
    expect(next).not.toHaveBeenCalled()
  })

  test('rejects with 403 for inactive token', async (): Promise<void> => {
    const introspectSpy = jest
      .spyOn(tokenIntrospectionClient, 'introspect')
      .mockResolvedValueOnce({ active: false })

    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 403,
      message: 'Inactive Token'
    })
    expect(introspectSpy).toHaveBeenCalledWith({
      access_token: token,
      access: [
        {
          type: type,
          actions: [action],
          identifier: ctx.walletAddressUrl
        }
      ]
    })
    expect(next).not.toHaveBeenCalled()
  })

  test('rejects with 403 for token with insufficient access', async (): Promise<void> => {
    const introspectSpy = jest
      .spyOn(tokenIntrospectionClient, 'introspect')
      .mockResolvedValueOnce({
        active: true,
        grant: uuid(),
        client: faker.internet.url({ appendSlash: false }),
        access: []
      })

    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 403,
      message: 'Insufficient Grant'
    })
    expect(introspectSpy).toHaveBeenCalledWith({
      access_token: token,
      access: [
        {
          type: type,
          actions: [action],
          identifier: ctx.walletAddressUrl
        }
      ]
    })
    expect(next).not.toHaveBeenCalled()
  })

  test('rejects with 500 for token with access.length > 1', async (): Promise<void> => {
    const introspectSpy = jest
      .spyOn(tokenIntrospectionClient, 'introspect')
      .mockResolvedValueOnce({
        active: true,
        grant: uuid(),
        client: faker.internet.url({ appendSlash: false }),
        access: [
          {
            type: type,
            actions: [action],
            identifier: ctx.walletAddressUrl
          },
          {
            type: type,
            actions: [action],
            identifier: ctx.walletAddressUrl
          }
        ]
      })

    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 500,
      message: 'Unexpected number of access items'
    })
    expect(introspectSpy).toHaveBeenCalledWith({
      access_token: token,
      access: [
        {
          type: type,
          actions: [action],
          identifier: ctx.walletAddressUrl
        }
      ]
    })
    expect(next).not.toHaveBeenCalled()
  })

  enum IdentifierOption {
    Matching = 'matching',
    Conflicting = 'conflicting',
    None = 'no'
  }

  describe.each`
    identifierOption
    ${IdentifierOption.Matching}
    ${IdentifierOption.Conflicting}
    ${IdentifierOption.None}
  `(
    '$identifierOption token access identifier',
    ({ identifierOption }): void => {
      let identifier: string | undefined

      beforeEach(async (): Promise<void> => {
        if (identifierOption === IdentifierOption.Matching) {
          identifier = ctx.walletAddressUrl
        } else if (identifierOption === IdentifierOption.Conflicting) {
          identifier = faker.internet.url({ appendSlash: false })
        }
      })

      const createTokenInfo = (
        access?: ActiveTokenInfo['access']
      ): ActiveTokenInfo => ({
        active: true,
        grant: uuid(),
        client: faker.internet.url({ appendSlash: false }),
        access: access ?? [
          {
            type: 'incoming-payment',
            actions: [action],
            identifier
          }
        ]
      })

      test.each`
        type                          | action                   | description
        ${AccessType.OutgoingPayment} | ${action}                | ${'type'}
        ${type}                       | ${AccessAction.Complete} | ${'action'}
      `(
        'returns 403 for unauthorized request (conflicting $description)',
        async ({ type, action }): Promise<void> => {
          const middleware = createTokenIntrospectionMiddleware({
            requestType: type,
            requestAction: action
          })
          const introspectSpy = jest
            .spyOn(tokenIntrospectionClient, 'introspect')
            .mockResolvedValueOnce({ active: false })
          await expect(middleware(ctx, next)).rejects.toMatchObject({
            status: 403,
            message: 'Inactive Token'
          })
          const expectedCallObject: IntrospectionCallObject = {
            access_token: token,
            access: [
              {
                type,
                actions: [action],
                identifier: ctx.walletAddressUrl
              }
            ]
          }

          expect(introspectSpy).toHaveBeenCalledWith(expectedCallObject)
          expect(next).not.toHaveBeenCalled()
        }
      )

      if (identifierOption !== IdentifierOption.Conflicting) {
        test('sets the context client info and calls next', async (): Promise<void> => {
          const tokenInfo = createTokenInfo()
          const introspectSpy = jest
            .spyOn(tokenIntrospectionClient, 'introspect')
            .mockResolvedValueOnce(tokenInfo)

          await expect(middleware(ctx, next)).resolves.toBeUndefined()
          expect(introspectSpy).toHaveBeenCalledWith({
            access_token: token,
            access: [
              {
                type,
                actions: [action],
                identifier: ctx.walletAddressUrl
              }
            ]
          })
          expect(next).toHaveBeenCalled()
          expect(ctx.client).toEqual(tokenInfo.client)
          expect(ctx.grant).toBeUndefined()
        })

        describe.each`
          superAction             | subAction
          ${AccessAction.ReadAll} | ${AccessAction.Read}
          ${AccessAction.ListAll} | ${AccessAction.List}
        `('$subAction/$superAction', ({ superAction, subAction }): void => {
          test("calls next (but doesn't designate client filtering) for sub-action request", async (): Promise<void> => {
            const middleware = createTokenIntrospectionMiddleware({
              requestType: type,
              requestAction: subAction
            })
            const tokenInfo = createTokenInfo([
              {
                type,
                actions: [superAction],
                identifier: identifier as string
              }
            ])
            const introspectSpy = jest
              .spyOn(tokenIntrospectionClient, 'introspect')
              .mockResolvedValueOnce(tokenInfo)

            await expect(middleware(ctx, next)).resolves.toBeUndefined()
            expect(introspectSpy).toHaveBeenCalledWith({
              access_token: token,
              access: [
                {
                  type,
                  actions: [subAction],
                  identifier: ctx.walletAddressUrl
                }
              ]
            })
            expect(next).toHaveBeenCalled()
            expect(ctx.client).toEqual(tokenInfo.client)
            expect(ctx.accessAction).toBe(superAction)
            expect(ctx.grant).toBeUndefined()
          })

          test('returns 403 for super-action request', async (): Promise<void> => {
            const middleware = createTokenIntrospectionMiddleware({
              requestType: type,
              requestAction: superAction
            })
            const introspectSpy = jest
              .spyOn(tokenIntrospectionClient, 'introspect')
              .mockResolvedValueOnce({ active: false })
            await expect(middleware(ctx, next)).rejects.toMatchObject({
              status: 403,
              message: 'Inactive Token'
            })
            expect(introspectSpy).toHaveBeenCalledWith({
              access_token: token,
              access: [
                {
                  type,
                  actions: [superAction],
                  identifier: ctx.walletAddressUrl
                }
              ]
            })
            expect(next).not.toHaveBeenCalled()
          })

          const limits = {
            receiveAmount: {
              value: '500',
              assetCode: 'EUR',
              assetScale: 2
            },
            debitAmount: {
              value: '811',
              assetCode: 'USD',
              assetScale: 2
            },
            receiver:
              'https://wallet2.example/bob/incoming-payments/aa9da466-12ba-4760-9aa0-8c06061f333b',
            interval: 'R/2022-03-01T13:00:00Z/P1M'
          }

          test.each`
            type                          | action                 | limits       | ctxGrant | ctxLimits
            ${AccessType.IncomingPayment} | ${AccessAction.Create} | ${undefined} | ${false} | ${false}
            ${AccessType.OutgoingPayment} | ${AccessAction.Read}   | ${limits}    | ${false} | ${false}
            ${AccessType.OutgoingPayment} | ${AccessAction.Create} | ${undefined} | ${true}  | ${false}
            ${AccessType.OutgoingPayment} | ${AccessAction.Create} | ${limits}    | ${true}  | ${limits}
          `(
            'sets the context grant limits and calls next (limitAccount: $limitAccount)',
            async ({
              type,
              action,
              limits,
              ctxGrant,
              ctxLimits
            }): Promise<void> => {
              const middleware = createTokenIntrospectionMiddleware({
                requestType: type,
                requestAction: action
              })
              const tokenInfo = createTokenInfo([
                {
                  type,
                  actions: [action],
                  identifier,
                  limits
                }
              ])
              const introspectSpy = jest
                .spyOn(tokenIntrospectionClient, 'introspect')
                .mockResolvedValueOnce(tokenInfo)

              await expect(middleware(ctx, next)).resolves.toBeUndefined()
              const expectedCallObject: IntrospectionCallObject = {
                access_token: token,
                access: [
                  {
                    type,
                    actions: [action],
                    identifier: ctx.walletAddressUrl
                  }
                ]
              }

              expect(introspectSpy).toHaveBeenCalledWith(expectedCallObject)
              expect(next).toHaveBeenCalled()
              expect(ctx.client).toEqual(tokenInfo.client)
              expect(ctx.accessAction).toBe(action)
              expect(ctx.grant).toEqual(
                ctxGrant
                  ? {
                      id: tokenInfo.grant,
                      limits: ctxLimits ? parseLimits(limits) : undefined
                    }
                  : undefined
              )
            }
          )
        })
      } else {
        test('returns 403 for super-action request', async (): Promise<void> => {
          const introspectSpy = jest
            .spyOn(tokenIntrospectionClient, 'introspect')
            .mockResolvedValueOnce({ active: false })
          await expect(middleware(ctx, next)).rejects.toMatchObject({
            status: 403,
            message: 'Inactive Token'
          })
          expect(introspectSpy).toHaveBeenCalledWith({
            access_token: token,
            access: [
              {
                type,
                actions: [action],
                identifier: ctx.walletAddressUrl
              }
            ]
          })
          expect(next).not.toHaveBeenCalled()
        })
      }
    }
  )
})

describe('authenticatedStatusMiddleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  test('sets ctx.authenticated to false if missing auth header', async (): Promise<void> => {
    const ctx = createContext<HttpSigWithAuthenticatedStatusContext>({
      headers: { 'signature-input': '' }
    })

    expect(authenticatedStatusMiddleware(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalled()
    expect(ctx.authenticated).toBe(false)
  })

  test('sets ctx.authenticated to false if http signature is invalid and existing auth header', async (): Promise<void> => {
    const ctx = createContext<HttpSigWithAuthenticatedStatusContext>({
      headers: { 'signature-input': '', authorization: 'GNAP token' }
    })

    expect(authenticatedStatusMiddleware(ctx, next)).rejects.toMatchObject({
      status: 401,
      message: 'Signature validation error: missing keyId in signature input'
    })
    expect(next).not.toHaveBeenCalled()
    expect(ctx.authenticated).toBe(false)
  })

  test('sets ctx.authenticated to true if http signature is valid', async (): Promise<void> => {
    const keyId = uuid()
    const privateKey = generateKeyPairSync('ed25519').privateKey
    const method = 'GET'
    const url = faker.internet.url({ appendSlash: false })
    const request = {
      method,
      url,
      headers: {
        Accept: 'application/json',
        Authorization: `GNAP ${token}`
      }
    }
    const ctx = createContext<HttpSigWithAuthenticatedStatusContext>({
      headers: {
        Accept: 'application/json',
        Authorization: `GNAP ${token}`,
        ...(await createHeaders({
          request,
          privateKey,
          keyId
        }))
      },
      method,
      url
    })
    ctx.container = deps
    ctx.client = faker.internet.url({ appendSlash: false })
    const key = generateJwk({
      keyId,
      privateKey
    })

    const scope = nock(ctx.client)
      .get('/jwks.json')
      .reply(200, {
        keys: [key]
      })

    await expect(
      authenticatedStatusMiddleware(ctx, next)
    ).resolves.toBeUndefined()
    expect(next).toHaveBeenCalled()
    expect(ctx.authenticated).toBe(true)

    scope.done()
  })
})

describe('HTTP Signature Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let ctx: HttpSigContext
  let key: JWK

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
      const url = faker.internet.url({ appendSlash: false })
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
      ctx.client = faker.internet.url({ appendSlash: false })
      key = generateJwk({
        keyId,
        privateKey
      })
    })

    test('calls next with valid http signature', async (): Promise<void> => {
      const scope = nock(ctx.client)
        .get('/jwks.json')
        .reply(200, {
          keys: [key]
        })
      await expect(httpsigMiddleware(ctx, next)).resolves.toBeUndefined()
      expect(next).toHaveBeenCalled()
      scope.done()
    })

    test('returns 401 for missing keyid', async (): Promise<void> => {
      ctx.request.headers['signature-input'] = 'aaaaaaaaaa'
      expect.assertions(3)

      try {
        await httpsigMiddleware(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.message).toBe(
          'Signature validation error: missing keyId in signature input'
        )
        expect(err.status).toBe(401)
      }

      expect(next).not.toHaveBeenCalled()
    })

    test('returns 401 for failed client key request', async (): Promise<void> => {
      expect.assertions(3)

      try {
        await httpsigMiddleware(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.message).toBe(
          'Signature validation error: could not retrieve client keys'
        )
        expect(err.status).toBe(401)
      }
      expect(next).not.toHaveBeenCalled()
    })

    test('returns 401 for invalid http signature', async (): Promise<void> => {
      const scope = nock(ctx.client)
        .get('/jwks.json')
        .reply(200, {
          keys: [key]
        })
      ctx.request.headers['signature'] = 'aaaaaaaaaa='

      expect.assertions(3)

      try {
        await httpsigMiddleware(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.message).toBe(
          'Signature validation error: provided signature is invalid'
        )
        expect(err.status).toBe(401)
      }

      expect(next).not.toHaveBeenCalled()
      scope.done()
    })

    test('returns 401 for invalid key type', async (): Promise<void> => {
      key.kty = 'EC' as 'OKP'
      const scope = nock(ctx.client)
        .get('/jwks.json')
        .reply(200, {
          keys: [key]
        })

      expect.assertions(3)

      try {
        await httpsigMiddleware(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.message).toBe(
          'Signature validation error: could not retrieve client keys'
        )
        expect(err.status).toBe(401)
      }
      expect(next).not.toHaveBeenCalled()

      scope.done()
    })

    if (body) {
      test('returns 401 if content-digest does not match the body', async (): Promise<void> => {
        const scope = nock(ctx.client)
          .get('/jwks.json')
          .reply(200, {
            keys: [key]
          })
        ctx.request.headers['content-digest'] = 'aaaaaaaaaa='

        expect.assertions(3)

        try {
          await httpsigMiddleware(ctx, next)
        } catch (err) {
          assert(err instanceof OpenPaymentsServerRouteError)
          expect(err.message).toBe(
            'Signature validation error: provided signature is invalid'
          )
          expect(err.status).toBe(401)
        }
        expect(next).not.toHaveBeenCalled()

        scope.done()
      })
    }
  })
})
