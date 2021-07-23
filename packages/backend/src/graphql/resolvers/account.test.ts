import { gql } from 'apollo-server-koa'
import Knex from 'knex'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { AccountService } from '../../account/service'
import { Account as AccountModel } from '../../account/model'
import { Account } from '../generated/graphql'

describe('Account Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
    }
  )

  afterAll(
    async (): Promise<void> => {
      await truncateTables(knex)
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  describe('Account', (): void => {
    let accountService: AccountService
    let account: AccountModel

    beforeEach(
      async (): Promise<void> => {
        accountService = await deps.use('accountService')
        account = await accountService.create(6, 'USD')
      }
    )

    test('Can get a account', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!) {
              account(id: $accountId) {
                id
                balance {
                  amount
                  scale
                  currency
                }
              }
            }
          `,
          variables: {
            accountId: account.id
          }
        })
        .then(
          (query): Account => {
            if (query.data) {
              return query.data.account
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query.id).toEqual(account.id)
      expect(query.balance.amount).toEqual(300)
      expect(query.balance.currency).toEqual('USD')
      expect(query.balance.scale).toEqual(6)
    })
  })
})
