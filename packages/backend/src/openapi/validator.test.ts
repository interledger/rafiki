import { v4 as uuid } from 'uuid'

import { OpenAPI, HttpMethod } from './'
import { createValidatorMiddleware } from './validator'
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
      validatePostMiddleware = createValidatorMiddleware({
        path: openApi.paths[PATH],
        method: HttpMethod.POST
      })
      validateListMiddleware = createValidatorMiddleware({
        path: openApi.paths[PATH],
        method: HttpMethod.GET
      })
    })

    beforeEach((): void => {
      next = jest.fn()
    })

    test.each`
      accountId       | message                                       | description
      ${undefined}    | ${" must have required property 'accountId'"} | ${'missing'}
      ${'not_a_uuid'} | ${'accountId must match format "uuid"'}       | ${'invalid'}
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

    // TODO:
    // Deserialize params
    test.skip('returns 400 on invalid query parameter', async (): Promise<void> => {
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
      headers                             | status | message                  | description
      ${{ Accept: 'text/plain' }}         | ${406} | ${'must accept json'}    | ${'Accept'}
      ${{ 'Content-Type': 'text/plain' }} | ${400} | ${'must send json body'} | ${'Content-Type'}
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
      body                                                                    | message                                              | description
      ${{ incomingAmount: 'fail' }}                                           | ${'incomingAmount must be object'}                   | ${'non-object incomingAmount'}
      ${{ incomingAmount: { value: '-2', assetCode: 'USD', assetScale: 2 } }} | ${'incomingAmount.value must match format "uint64"'} | ${'invalid incomingAmount, value non-positive'}
      ${{ incomingAmount: { value: '2', assetCode: 4, assetScale: 2 } }}      | ${'incomingAmount.assetCode must be string'}         | ${'invalid incomingAmount, assetCode not string'}
      ${{ incomingAmount: { value: '2', assetCode: 'USD', assetScale: -2 } }} | ${'incomingAmount.assetScale must be >= 0'}          | ${'invalid incomingAmount, assetScale negative'}
      ${{ description: 123 }}                                                 | ${'description must be string'}                      | ${'invalid description'}
      ${{ externalRef: 123 }}                                                 | ${'externalRef must be string'}                      | ${'invalid externalRef'}
      ${{ expiresAt: 'fail' }}                                                | ${'expiresAt must match format "date-time"'}         | ${'invalid expiresAt'}
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

    test('calls next on valid request', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        {
          accountId
        }
      )
      await expect(validateListMiddleware(ctx, next)).resolves.toBeUndefined()
      expect(next).toHaveBeenCalled()
    })
  })
})
