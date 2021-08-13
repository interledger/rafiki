import { Model } from 'objection'
import { Transaction } from 'knex'

import { AccountFactory } from '../../accounts/testsHelpers'
import {
  CreateDepositInput,
  CreateDepositMutationResponse
} from '../generated/graphql'
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
      const deposit: CreateDepositInput = {
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
  })
})
