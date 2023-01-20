import { generateKeyPairSync } from 'crypto'
import { faker } from '@faker-js/faker'
import { Client, ActiveTokenInfo } from 'token-introspection'
import { v4 as uuid } from 'uuid'
import {
  generateJwk,
  generateTestKeys,
  createHeaders
} from 'http-signature-utils'

import {
  createTokenIntrospectionMiddleware,
  httpsigMiddleware
} from './middleware'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices, HttpSigContext, PaymentPointerContext } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { setup } from '../payment_pointer/model.test'
import { parseLimits } from '../payment/outgoing/limits'
import { AccessAction, AccessType } from 'open-payments'

type AppMiddleware = (
  ctx: PaymentPointerContext,
  next: () => Promise<void>
) => Promise<void>

const next: jest.MockedFunction<() => Promise<void>> = jest.fn()
const token = 'OS9M2PMHKUR64TB8N6BW7OZB8CDFONP219RP1LT0'

describe('Auth Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let middleware: AppMiddleware
  let ctx: PaymentPointerContext
  let tokenIntrospectionClient: Client
  const key: ActiveTokenInfo['key'] = {
    jwk: generateTestKeys().publicKey,
    proof: 'httpsig'
  }

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
      paymentPointer: await createPaymentPointer(deps)
    })
    ctx.container = deps
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  test.each`
    authorization             | description
    ${undefined}              | ${'missing'}
    ${'Bearer NOT-GNAP'}      | ${'invalid'}
    ${'GNAP'}                 | ${'missing'}
    ${'GNAP multiple tokens'} | ${'invalid'}
  `(
    'returns 401 for $description access token',
    async ({ authorization }): Promise<void> => {
      const introspectSpy = jest.spyOn(tokenIntrospectionClient, 'introspect')
      ctx.request.headers.authorization = authorization
      await expect(middleware(ctx, next)).resolves.toBeUndefined()
      expect(introspectSpy).not.toHaveBeenCalled()
      expect(ctx.status).toBe(401)
      expect(ctx.message).toEqual('Unauthorized')
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
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(introspectSpy).toHaveBeenCalledWith({
      access_token: token
    })
    expect(ctx.status).toBe(401)
    expect(ctx.message).toEqual('Invalid Token')
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
      access_token: token
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
          identifier = ctx.paymentPointer.url
        } else if (identifierOption === IdentifierOption.Conflicting) {
          identifier = faker.internet.url()
        }
      })

      const createTokenInfo = (
        access?: ActiveTokenInfo['access']
      ): ActiveTokenInfo => ({
        active: true,
        grant: uuid(),
        client_id: uuid(),
        access: access ?? [
          {
            type: 'incoming-payment',
            actions: [action],
            identifier
          }
        ],
        key
      })

      test.each`
        type                          | action                   | description
        ${AccessType.OutgoingPayment} | ${action}                | ${'type'}
        ${type}                       | ${AccessAction.Complete} | ${'action'}
      `(
        'returns 403 for unauthorized request (conflicting $description)',
        async ({ type, action }): Promise<void> => {
          const tokenInfo = createTokenInfo([
            {
              type,
              actions: [action],
              identifier
            }
          ])
          const introspectSpy = jest
            .spyOn(tokenIntrospectionClient, 'introspect')
            .mockResolvedValueOnce(tokenInfo)
          await expect(middleware(ctx, next)).rejects.toMatchObject({
            status: 403,
            message: 'Insufficient Grant'
          })
          expect(introspectSpy).toHaveBeenCalledWith({
            access_token: token
          })
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
            access_token: token
          })
          expect(next).toHaveBeenCalled()
          expect(ctx.clientId).toEqual(tokenInfo.client_id)
          expect(ctx.clientKey).toEqual(tokenInfo.key.jwk)
          expect(ctx.grant).toBeUndefined()
        })

        describe.each`
          superAction             | subAction
          ${AccessAction.ReadAll} | ${AccessAction.Read}
          ${AccessAction.ListAll} | ${AccessAction.List}
        `('$subAction/$superAction', ({ superAction, subAction }): void => {
          test("calls next (but doesn't restrict ctx.clientId) for sub-action request", async (): Promise<void> => {
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
              access_token: token
            })
            expect(next).toHaveBeenCalled()
            expect(ctx.clientId).toBeUndefined()
            expect(ctx.clientKey).toEqual(tokenInfo.key.jwk)
            expect(ctx.grant).toBeUndefined()
          })

          test('returns 403 for super-action request', async (): Promise<void> => {
            const middleware = createTokenIntrospectionMiddleware({
              requestType: type,
              requestAction: superAction
            })
            const tokenInfo = createTokenInfo([
              {
                type,
                actions: [subAction],
                identifier: identifier as string
              }
            ])
            const introspectSpy = jest
              .spyOn(tokenIntrospectionClient, 'introspect')
              .mockResolvedValueOnce(tokenInfo)
            await expect(middleware(ctx, next)).rejects.toMatchObject({
              status: 403,
              message: 'Insufficient Grant'
            })
            expect(introspectSpy).toHaveBeenCalledWith({
              access_token: token
            })
            expect(next).not.toHaveBeenCalled()
          })

          const limits = {
            receiveAmount: {
              value: '500',
              assetCode: 'EUR',
              assetScale: 2
            },
            sendAmount: {
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
              expect(introspectSpy).toHaveBeenCalledWith({
                access_token: token
              })
              expect(next).toHaveBeenCalled()
              expect(ctx.clientId).toEqual(tokenInfo.client_id)
              expect(ctx.clientKey).toEqual(tokenInfo.key.jwk)
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
          const tokenInfo = createTokenInfo()
          const introspectSpy = jest
            .spyOn(tokenIntrospectionClient, 'introspect')
            .mockResolvedValueOnce(tokenInfo)
          await expect(middleware(ctx, next)).rejects.toMatchObject({
            status: 403,
            message: 'Insufficient Grant'
          })
          expect(introspectSpy).toHaveBeenCalledWith({
            access_token: token
          })
          expect(next).not.toHaveBeenCalled()
        })
      }
    }
  )
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
      ctx.clientKey = generateJwk({
        keyId,
        privateKey
      })
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
      ctx.clientKey.kty = 'EC' as 'OKP'
      await expect(httpsigMiddleware(ctx, next)).rejects.toMatchObject({
        status: 401,
        message: 'Invalid signature'
      })
      expect(next).not.toHaveBeenCalled()
    })

    // TODO: remove with
    // https://github.com/interledger/rafiki/issues/737
    test.skip('returns 401 if any signature keyid does not match the jwk key id', async (): Promise<void> => {
      ctx.clientKey.kid = 'mismatched-key'
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
