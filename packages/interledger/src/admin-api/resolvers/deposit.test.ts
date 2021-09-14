import { Model } from 'objection'
import { Transaction } from 'knex'
import { v4 as uuid } from 'uuid'

import { AccountFactory } from '../../testsHelpers'
import { isDepositError } from '../../deposit/service'
import { CreateDepositMutationResponse } from '../generated/graphql'
import { gql } from 'apollo-server'

import { createTestApp, TestContainer } from '../testsHelpers/app'

describe('Deposit Resolvers', (): void => {
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

  describe('Create Deposit', (): void => {
    test('Can create an ilp account deposit', async (): Promise<void> => {
      const { id: ilpAccountId } = await accountFactory.build()
      const amount = '100'
      const deposit = {
        ilpAccountId,
        amount
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateDeposit($input: CreateDepositInput!) {
              createDeposit(input: $input) {
                code
                success
                message
                deposit {
                  id
                  ilpAccountId
                  amount
                }
              }
            }
          `,
          variables: {
            input: deposit
          }
        })
        .then(
          (query): CreateDepositMutationResponse => {
            if (query.data) {
              return query.data.createDeposit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.deposit?.id).not.toBeNull()
      expect(response.deposit?.ilpAccountId).toEqual(ilpAccountId)
      expect(response.deposit?.amount).toEqual(amount)
    })

    test('Returns an error for invalid id', async (): Promise<void> => {
      const { id: ilpAccountId } = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateDeposit($input: CreateDepositInput!) {
              createDeposit(input: $input) {
                code
                success
                message
                deposit {
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
          (query): CreateDepositMutationResponse => {
            if (query.data) {
              return query.data.createDeposit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Invalid id')
      expect(response.deposit).toBeNull()
    })

    test('Returns an error for unknown account', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateDeposit($input: CreateDepositInput!) {
              createDeposit(input: $input) {
                code
                success
                message
                deposit {
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
          (query): CreateDepositMutationResponse => {
            if (query.data) {
              return query.data.createDeposit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown ILP account')
      expect(response.deposit).toBeNull()
    })

    test('Returns an error for existing deposit', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const depositOrError = await appContainer.depositService.create({
        accountId,
        amount: BigInt(100)
      })
      if (isDepositError(depositOrError)) {
        fail()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateDeposit($input: CreateDepositInput!) {
              createDeposit(input: $input) {
                code
                success
                message
                deposit {
                  id
                }
              }
            }
          `,
          variables: {
            input: {
              id: depositOrError.id,
              ilpAccountId: accountId,
              amount: '100'
            }
          }
        })
        .then(
          (query): CreateDepositMutationResponse => {
            if (query.data) {
              return query.data.createDeposit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Deposit exists')
      expect(response.deposit).toBeNull()
    })
  })
})
