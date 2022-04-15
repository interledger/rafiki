import nock from 'nock'
import { URL } from 'url'
import { v4 as uuid } from 'uuid'

import { createAuthMiddleware } from './middleware'
import { Grant, GrantJSON, AccessType, AccessAction } from './grant'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppContext, AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'

type AppMiddleware = (
  ctx: AppContext,
  next: () => Promise<void>
) => Promise<void>

describe('Auth Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accountId: string
  let authServerIntrospectionUrl: URL
  let middleware: AppMiddleware
  let ctx: AppContext
  let next: jest.MockedFunction<() => Promise<void>>
  const token = 'OS9M2PMHKUR64TB8N6BW7OZB8CDFONP219RP1LT0'

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      accountId = `${Config.publicHost}/${uuid()}`
      authServerIntrospectionUrl = new URL(Config.authServerIntrospectionUrl)
      middleware = createAuthMiddleware({
        type: AccessType.IncomingPayment,
        action: AccessAction.Read
      })
    }
  )

  beforeEach((): void => {
    ctx = createContext(
      {
        headers: {
          Accept: 'application/json',
          Authorization: `GNAP ${token}`
        }
      },
      {
        accountId
      }
    )
    ctx.container = deps
    next = jest.fn()
  })

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
    }
  )

  function mockAuthServer(
    grant: GrantJSON | string | undefined = undefined
  ): nock.Scope {
    return nock(authServerIntrospectionUrl.origin)
      .post(authServerIntrospectionUrl.pathname, { access_token: token })
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
    grant: 'PRY5NM33OM4TB8N6BW7'
  }

  test.each`
    grant            | description
    ${undefined}     | ${'unknown token/grant'}
    ${'bad grant'}   | ${'invalid grant'}
    ${inactiveGrant} | ${'inactive grant'}
  `(
    'Returns 401 for $description',
    async ({ grant }): Promise<void> => {
      const scope = mockAuthServer(grant)
      await expect(middleware(ctx, next)).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      expect(ctx.message).toEqual('Invalid Token')
      expect(ctx.response.get('WWW-Authenticate')).toBe(
        `GNAP as_uri=${Config.authServerGrantUrl}`
      )
      expect(next).not.toHaveBeenCalled()
      scope.isDone()
    }
  )

  test('returns 403 for unauthorized request', async (): Promise<void> => {
    const scope = mockAuthServer({
      active: true,
      grant: 'PRY5NM33OM4TB8N6BW7',
      access: [
        {
          type: AccessType.OutgoingPayment,
          actions: [AccessAction.Create]
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

  test.each`
    limitAccount
    ${false}
    ${true}
  `(
    'sets the context grant and calls next (limitAccount: $limitAccount)',
    async ({ limitAccount }): Promise<void> => {
      const grant = new Grant({
        active: true,
        grant: 'PRY5NM33OM4TB8N6BW7',
        access: [
          {
            type: AccessType.IncomingPayment,
            actions: [AccessAction.Read],
            identifier: limitAccount ? ctx.params.accountId : undefined
          },
          {
            type: AccessType.OutgoingPayment,
            actions: [AccessAction.Create, AccessAction.Read],
            identifier: 'alice',
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
              receivingAccount: 'https://wallet2.example/bob'
            }
          },
          {
            type: AccessType.OutgoingPayment,
            actions: [AccessAction.Create],
            identifier: 'alice',
            limits: {
              receivingPayment:
                'https://wallet2.example/bob/incoming-payments/fi7td6dito8yf6t'
            }
          }
        ]
      })
      const scope = mockAuthServer(grant.toJSON())
      await expect(middleware(ctx, next)).resolves.toBeUndefined()
      expect(next).toHaveBeenCalled()
      expect(ctx.grant).toEqual(grant)
      scope.isDone()
    }
  )
})
