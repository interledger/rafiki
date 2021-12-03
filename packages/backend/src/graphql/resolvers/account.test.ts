import assert from 'assert'
import { gql } from 'apollo-server-koa'
import Knex from 'knex'
import { v4 as uuid } from 'uuid'
import { ApolloError } from '@apollo/client'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { AccountService } from '../../open_payments/account/service'
import { randomAsset } from '../../tests/asset'
import {
  CreateAccountInput,
  CreateAccountMutationResponse,
  Account
} from '../generated/graphql'

describe('Account Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let accountService: AccountService

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      accountService = await deps.use('accountService')
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

  describe('Create Account', (): void => {
    test('Can create an account', async (): Promise<void> => {
      const input: CreateAccountInput = {
        asset: randomAsset()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAccount($input: CreateAccountInput!) {
              createAccount(input: $input) {
                code
                success
                message
                account {
                  id
                  asset {
                    code
                    scale
                  }
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then(
          (query): CreateAccountMutationResponse => {
            if (query.data) {
              return query.data.createAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      assert(response.account)
      expect(response.account).toEqual({
        __typename: 'Account',
        id: response.account.id,
        asset: {
          __typename: 'Asset',
          code: input.asset.code,
          scale: input.asset.scale
        }
      })
      await expect(
        accountService.get(response.account.id)
      ).resolves.toMatchObject({
        id: response.account.id,
        asset: {
          code: input.asset.code,
          scale: input.asset.scale
        }
      })
    })

    test('500', async (): Promise<void> => {
      jest
        .spyOn(accountService, 'create')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })
      const input: CreateAccountInput = {
        asset: randomAsset()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAccount($input: CreateAccountInput!) {
              createAccount(input: $input) {
                code
                success
                message
                account {
                  id
                  asset {
                    code
                    scale
                  }
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then(
          (query): CreateAccountMutationResponse => {
            if (query.data) {
              return query.data.createAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(response.code).toBe('500')
      expect(response.success).toBe(false)
      expect(response.message).toBe('Error trying to create account')
    })
  })

  describe('Account Queries', (): void => {
    test('Can get an account', async (): Promise<void> => {
      const asset = randomAsset()
      const account = await accountService.create({ asset })
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!) {
              account(id: $accountId) {
                id
                asset {
                  code
                  scale
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

      expect(query).toEqual({
        __typename: 'Account',
        id: account.id,
        asset: {
          __typename: 'Asset',
          code: account.asset.code,
          scale: account.asset.scale
        }
      })
    })

    test('Returns error for unknown account', async (): Promise<void> => {
      const gqlQuery = appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!) {
              account(id: $accountId) {
                id
              }
            }
          `,
          variables: {
            accountId: uuid()
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

      await expect(gqlQuery).rejects.toThrow(ApolloError)
    })
  })
})
