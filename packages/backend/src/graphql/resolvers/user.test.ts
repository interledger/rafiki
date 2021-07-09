import { gql } from 'apollo-server-koa'
import Knex from 'knex'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { User } from '../generated/graphql'
import { User as UserModel } from '../../user/model'
import { UserService } from '../../user/service'
import { truncateTables } from '../../tests/tableManager'

describe('User Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  const overrideConfig = {
    ...Config,
    databaseUrl: `${process.env.DATABASE_URL}_${process.env.JEST_WORKER_ID}`
  }

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(overrideConfig)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
      await truncateTables(knex)
    }
  )

  describe('User', (): void => {
    let userService: UserService
    let user: UserModel

    beforeEach(
      async (): Promise<void> => {
        userService = await deps.use('userService')
        user = await userService.create()
      }
    )

    test('Can get a user', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query User($userId: String!) {
              user(userId: $userId) {
                id
              }
            }
          `,
          variables: {
            userId: user.id
          }
        })
        .then(
          (query): User => {
            if (query.data) {
              return query.data.user
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.id).toEqual(user.id)
    })

    test("Can get a user's account", async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query User($userId: String!) {
              user(userId: $userId) {
                account {
                  id
                  balance {
                    amount
                    scale
                    currency
                  }
                }
              }
            }
          `,
          variables: {
            userId: user.id
          }
        })
        .then(
          (query): User => {
            if (query.data) {
              return query.data.user
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.account.id).toEqual(user.accountId)
      expect(query.account.balance.amount).toEqual(300)
      expect(query.account.balance.currency).toEqual('USD')
      expect(query.account.balance.scale).toEqual(6)
    })
  })
})
