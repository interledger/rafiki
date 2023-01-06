import { gql } from 'apollo-server-koa'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { createPaymentPointer } from '../../tests/paymentPointer'
import {
  RefreshSessionInput,
  RefreshSessionMutationResponse,
  RevokeSessionInput,
  RevokeSessionMutationResponse
} from '../generated/graphql'
import { ApiKeyService } from '../../apiKey/service'
import { SessionService } from '../../session/service'
import { isApiKeyError } from '../../apiKey/errors'

describe('Session Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let apiKeyService: ApiKeyService
  let sessionService: SessionService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    apiKeyService = await deps.use('apiKeyService')
    sessionService = await deps.use('sessionService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Session Mutations', (): void => {
    test('Session can be refreshed', async (): Promise<void> => {
      const { id: paymentPointerId } = await createPaymentPointer(deps)
      const apiKey = await apiKeyService.create({ paymentPointerId })
      const sessionOrError = await apiKeyService.redeem({
        paymentPointerId,
        key: apiKey.key
      })
      if (isApiKeyError(sessionOrError)) {
        fail()
      } else {
        const input: RefreshSessionInput = {
          key: sessionOrError.key
        }
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation RefreshSession($input: RefreshSessionInput!) {
                refreshSession(input: $input) {
                  code
                  success
                  message
                  session {
                    key
                    expiresAt
                  }
                }
              }
            `,
            variables: {
              input
            }
          })
          .then((query): RefreshSessionMutationResponse => {
            if (query.data) {
              return query.data.refreshSession
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        expect(response.session?.key).not.toBeNull()
        expect(response.session?.expiresAt).not.toBeNull()
        if (response.session) {
          const session = await sessionService.get(response.session.key)
          if (!session) {
            fail()
          } else {
            expect(Number(response.session.expiresAt)).toBeGreaterThanOrEqual(
              session.expiresAt.getTime()
            )
          }
        } else {
          fail()
        }
      }
    })

    test('Session can be revoked', async (): Promise<void> => {
      const { id: paymentPointerId } = await createPaymentPointer(deps)
      const apiKey = await apiKeyService.create({ paymentPointerId })
      const sessionOrError = await apiKeyService.redeem({
        paymentPointerId,
        key: apiKey.key
      })
      if (isApiKeyError(sessionOrError)) {
        fail()
      } else {
        const input: RevokeSessionInput = {
          key: sessionOrError.key
        }
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation RevokeSession($input: RevokeSessionInput!) {
                revokeSession(input: $input) {
                  code
                  success
                  message
                }
              }
            `,
            variables: {
              input
            }
          })
          .then((query): RevokeSessionMutationResponse => {
            if (query.data) {
              return query.data.revokeSession
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        const session = sessionService.get(sessionOrError.key)
        expect(session).resolves.toBeUndefined()
      }
    })
  })
})
