import { Model } from 'objection'
import { Transaction } from 'knex'
import { v4 as uuid } from 'uuid'

import { AccountFactory } from '../../accounts/testsHelpers'
import { CreateWithdrawalMutationResponse } from '../generated/graphql'
import { gql } from 'apollo-server'

import { createTestApp, TestContainer } from '../testsHelpers/app'

describe('Withdrawal Resolvers', (): void => {
  let accountFactory: AccountFactory
  let appContainer: TestContainer
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      appContainer = await createTestApp()
      accountFactory = new AccountFactory(appContainer.accountsService)
    }
  )

  beforeEach(
    async (): Promise<void> => {
      trx = await appContainer.knex.transaction()
      Model.knex(trx)
    }
  )

  afterEach(
    async (): Promise<void> => {
      await trx.rollback()
      await trx.destroy()
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
    }
  )

  describe('Create Withdrawal', (): void => {
    test('Can create an ilp account withdrawal', async (): Promise<void> => {
      const { id: ilpAccountId } = await accountFactory.build()
      const amount = BigInt(100)
      await appContainer.accountsService.deposit({
        accountId: ilpAccountId,
        amount
      })
      const withdrawal = {
        ilpAccountId,
        amount: amount.toString()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateWithdrawal($input: CreateWithdrawalInput!) {
              createWithdrawal(input: $input) {
                code
                success
                message
                withdrawal {
                  id
                  ilpAccountId
                  amount
                }
              }
            }
          `,
          variables: {
            input: withdrawal
          }
        })
        .then(
          (query): CreateWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.createWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.withdrawal?.id).not.toBeNull()
      expect(response.withdrawal?.ilpAccountId).toEqual(ilpAccountId)
      expect(response.withdrawal?.amount).toEqual(amount.toString())
    })

    test('Returns an error for unknown account', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateWithdrawal($input: CreateWithdrawalInput!) {
              createWithdrawal(input: $input) {
                code
                success
                message
                withdrawal {
                  id
                }
              }
            }
          `,
          variables: {
            input: {
              ilpAccountId: uuid(),
              amount: '100'
            }
          }
        })
        .then(
          (query): CreateWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.createWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown ILP account')
      expect(response.withdrawal).toBeNull()
    })

    test('Returns an error for invalid id', async (): Promise<void> => {
      const { id: ilpAccountId } = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateWithdrawal($input: CreateWithdrawalInput!) {
              createWithdrawal(input: $input) {
                code
                success
                message
                withdrawal {
                  id
                }
              }
            }
          `,
          variables: {
            input: {
              id: 'not a uuid v4',
              ilpAccountId,
              amount: '100'
            }
          }
        })
        .then(
          (query): CreateWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.createWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Invalid id')
      expect(response.withdrawal).toBeNull()
    })

    test('Returns an error for existing withdrawal', async (): Promise<void> => {
      const { id: ilpAccountId } = await accountFactory.build()
      const amount = BigInt(10)
      await appContainer.accountsService.deposit({
        accountId: ilpAccountId,
        amount: BigInt(100)
      })
      const id = uuid()
      await appContainer.accountsService.createWithdrawal({
        id,
        accountId: ilpAccountId,
        amount
      })
      const withdrawal = {
        id,
        ilpAccountId,
        amount: amount.toString()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateWithdrawal($input: CreateWithdrawalInput!) {
              createWithdrawal(input: $input) {
                code
                success
                message
                withdrawal {
                  id
                }
              }
            }
          `,
          variables: {
            input: withdrawal
          }
        })
        .then(
          (query): CreateWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.createWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Withdrawal exists')
      expect(response.withdrawal).toBeNull()
    })

    test('Returns error for insufficient balance', async (): Promise<void> => {
      const { id: ilpAccountId } = await accountFactory.build()
      const withdrawal = {
        ilpAccountId,
        amount: '100'
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateWithdrawal($input: CreateWithdrawalInput!) {
              createWithdrawal(input: $input) {
                code
                success
                message
                withdrawal {
                  id
                }
              }
            }
          `,
          variables: {
            input: withdrawal
          }
        })
        .then(
          (query): CreateWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.createWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('403')
      expect(response.message).toEqual('Insufficient balance')
      expect(response.withdrawal).toBeNull()
    })
  })
})
