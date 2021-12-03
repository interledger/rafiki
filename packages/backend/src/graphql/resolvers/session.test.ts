import { gql } from 'apollo-server-koa'
import Knex from 'knex'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { AccountService } from '../../account/service'
import { AccountFactory } from '../../tests/accountFactory'
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
  let knex: Knex
  let accountService: AccountService
  let accountFactory: AccountFactory
  let apiKeyService: ApiKeyService
  let sessionService: SessionService

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      accountService = await deps.use('accountService')
      accountFactory = new AccountFactory(accountService)
      apiKeyService = await deps.use('apiKeyService')
      sessionService = await deps.use('sessionService')
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  describe('Session Mutations', (): void => {
    test('Session can be refreshed', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const apiKey = await apiKeyService.create({ accountId })
      const sessionOrError = await apiKeyService.redeem({
        accountId,
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
          .then(
            (query): RefreshSessionMutationResponse => {
              if (query.data) {
                return query.data.refreshSession
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        expect(response.session?.key).not.toBeNull()
        expect(response.session?.expiresAt).not.toBeNull()
        if (response.session) {
          const session = await sessionService.get({
            key: response.session.key
          })
          if (!session) {
            fail()
          } else {
            expect(new Date(Number(response.session.expiresAt))).toEqual(
              session.expiresAt
            )
          }
        } else {
          fail()
        }
      }
    })

    test('Session can be revoked', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const apiKey = await apiKeyService.create({ accountId })
      const sessionOrError = await apiKeyService.redeem({
        accountId,
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
          .then(
            (query): RevokeSessionMutationResponse => {
              if (query.data) {
                return query.data.revokeSession
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
      }
    })
  })
})
