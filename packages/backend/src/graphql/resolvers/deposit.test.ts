import { gql } from 'apollo-server-koa'
import Knex from 'knex'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { isDepositError, DepositService } from '../../deposit/service'
import { AccountFactory } from '../../tests/accountFactory'
import { truncateTables } from '../../tests/tableManager'
import { CreateDepositMutationResponse } from '../generated/graphql'

describe('Deposit Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let depositService: DepositService
  let accountFactory: AccountFactory
  let knex: Knex

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      depositService = await deps.use('depositService')
      const accountService = await deps.use('accountService')
      accountFactory = new AccountFactory(accountService)
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

  describe('Create Deposit', (): void => {
    test('Can create an ilp account deposit', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = '100'
      const deposit = {
        accountId,
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
                  accountId
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
      expect(response.deposit?.accountId).toEqual(accountId)
      expect(response.deposit?.amount).toEqual(amount)
    })

    test('Returns an error for invalid id', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
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
              accountId,
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
              accountId: uuid(),
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
      const depositOrError = await depositService.create({
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
              accountId: accountId,
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
