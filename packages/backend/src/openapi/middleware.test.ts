import { v4 as uuid } from 'uuid'

import { OpenAPI, HttpMethod } from './'
import { createValidatorMiddleware } from './middleware'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppContext, AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { createContext } from '../tests/context'

type AppMiddleware = (
  ctx: AppContext,
  next: () => Promise<void>
) => Promise<void>

const PATH = '/{accountId}/incoming-payments'

describe('OpenAPI Validator', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let openApi: OpenAPI

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      openApi = await deps.use('openApi')
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
    }
  )

  describe('createValidatorMiddleware', (): void => {
    let next: jest.MockedFunction<() => Promise<void>>
    let validatePostMiddleware: AppMiddleware
    let validateListMiddleware: AppMiddleware
    const accountId = uuid()

    beforeAll((): void => {
      validatePostMiddleware = createValidatorMiddleware(openApi, {
        path: PATH,
        method: HttpMethod.POST
      })
      validateListMiddleware = createValidatorMiddleware(openApi, {
        path: PATH,
        method: HttpMethod.GET
      })
    })

    beforeEach((): void => {
      next = jest.fn()
    })

    test.each`
      accountId    | message                                      | description
      ${undefined} | ${"must have required property 'accountId'"} | ${'missing'}
      ${2}         | ${'accountId must be string'}                | ${'invalid'}
    `(
      'returns 400 on $description path parameter',
      async ({ accountId, message }): Promise<void> => {
        const ctx = createContext(
          {
            headers: { Accept: 'application/json' }
          },
          {
            accountId
          }
        )
        await expect(validateListMiddleware(ctx, next)).rejects.toMatchObject({
          status: 400,
          message
        })
        expect(next).not.toHaveBeenCalled()
      }
    )

    test('returns 400 on invalid query parameter', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' },
          url: `${PATH}?first=NaN`
        },
        {
          accountId
        }
      )
      await expect(validateListMiddleware(ctx, next)).rejects.toMatchObject({
        status: 400,
        message: 'first must be integer'
      })
      expect(next).not.toHaveBeenCalled()
    })

    test.each`
      headers                             | status | message                                  | description
      ${{ Accept: 'text/plain' }}         | ${406} | ${'must accept json'}                    | ${'Accept'}
      ${{ 'Content-Type': 'text/plain' }} | ${415} | ${'Unsupported Content-Type text/plain'} | ${'Content-Type'}
    `(
      'returns $status on invalid $description header',
      async ({ headers, status, message }): Promise<void> => {
        const ctx = createContext(
          {
            headers
          },
          {
            accountId
          }
        )
        await expect(validatePostMiddleware(ctx, next)).rejects.toMatchObject({
          status,
          message
        })
        expect(next).not.toHaveBeenCalled()
      }
    )

    test.each`
      body                                                                    | message                                                                         | description
      ${undefined}                                                            | ${'request.body was not present in the request.  Is a body-parser being used?'} | ${'missing body'}
      ${{ incomingAmount: 'fail' }}                                           | ${'body.incomingAmount must be object'}                                         | ${'non-object incomingAmount'}
      ${{ incomingAmount: { value: '-2', assetCode: 'USD', assetScale: 2 } }} | ${'body.incomingAmount.value must match format "uint64"'}                       | ${'invalid incomingAmount, value non-positive'}
      ${{ incomingAmount: { value: '2', assetCode: 4, assetScale: 2 } }}      | ${'body.incomingAmount.assetCode must be string'}                               | ${'invalid incomingAmount, assetCode not string'}
      ${{ incomingAmount: { value: '2', assetCode: 'USD', assetScale: -2 } }} | ${'body.incomingAmount.assetScale must be >= 0'}                                | ${'invalid incomingAmount, assetScale negative'}
      ${{ description: 123 }}                                                 | ${'body.description must be string'}                                            | ${'invalid description'}
      ${{ externalRef: 123 }}                                                 | ${'body.externalRef must be string'}                                            | ${'invalid externalRef'}
      ${{ expiresAt: 'fail' }}                                                | ${'body.expiresAt must match format "date-time"'}                               | ${'invalid expiresAt'}
      ${{ additionalProp: 'disallowed' }}                                     | ${'body must NOT have additional properties: additionalProp'}                   | ${'invalid additional property'}
    `(
      'returns 400 on invalid body ($description)',
      async ({ body, message }): Promise<void> => {
        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          },
          {
            accountId
          }
        )
        ctx.request.body = body
        await expect(validatePostMiddleware(ctx, next)).rejects.toMatchObject({
          status: 400,
          message
        })
        expect(next).not.toHaveBeenCalled()
      }
    )

    test('sets default query params and calls next on valid request', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {
          accountId
        }
      )
      const next = jest.fn().mockImplementation(() => {
        expect(ctx.request.query).toEqual({
          first: 10,
          last: 10
        })
        ctx.response.body = {}
      })
      await expect(validateListMiddleware(ctx, next)).resolves.toBeUndefined()
      expect(next).toHaveBeenCalled()
    })

    test.each`
      status | body                    | message                                                           | description
      ${202} | ${{}}                   | ${'An unknown status code was used and no default was provided.'} | ${'status code'}
      ${200} | ${{ invalid: 'field' }} | ${'response must NOT have additional properties: invalid'}        | ${'body'}
    `(
      'returns 500 on invalid response $description',
      async ({ status, body, message }): Promise<void> => {
        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json'
            }
          },
          {
            accountId
          }
        )
        const next = jest.fn().mockImplementation(() => {
          ctx.status = status
          ctx.response.body = body
        })
        await expect(validateListMiddleware(ctx, next)).rejects.toMatchObject({
          status: 500,
          message
        })
        expect(next).toHaveBeenCalled()
      }
    )
  })
})
