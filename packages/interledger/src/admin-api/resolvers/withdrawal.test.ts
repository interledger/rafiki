import { Model } from 'objection'
import { Transaction } from 'knex'
import { v4 as uuid } from 'uuid'

import { AccountFactory } from '../../accounts/testsHelpers'
import {
  CreateWithdrawalMutationResponse,
  FinalizePendingWithdrawalMutationResponse,
  RollbackPendingWithdrawalMutationResponse,
  WithdrawalError
} from '../generated/graphql'
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
      await appContainer.depositService.create({
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
                error
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
      expect(response.error).toBeNull()
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
                error
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
      expect(response.error).toEqual(WithdrawalError.UnknownAccount)
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
                error
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
      expect(response.error).toEqual(WithdrawalError.InvalidId)
      expect(response.withdrawal).toBeNull()
    })

    test('Returns an error for existing withdrawal', async (): Promise<void> => {
      const { id: ilpAccountId } = await accountFactory.build()
      const amount = BigInt(10)
      await appContainer.depositService.create({
        accountId: ilpAccountId,
        amount: BigInt(100)
      })
      const id = uuid()
      await appContainer.withdrawalService.create({
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
                error
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
      expect(response.error).toEqual(WithdrawalError.WithdrawalExists)
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
                error
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
      expect(response.error).toEqual(WithdrawalError.InsufficientBalance)
      expect(response.withdrawal).toBeNull()
    })
  })

  describe('Create Withdrawal', (): void => {
    test('Can finalize an ilp account withdrawal', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(100)
      await appContainer.depositService.create({
        accountId,
        amount
      })
      const id = uuid()
      await appContainer.withdrawalService.create({
        id,
        accountId,
        amount
      })
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation FinalizePendingWithdrawal($withdrawalId: ID!) {
              finalizePendingWithdrawal(withdrawalId: $withdrawalId) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            withdrawalId: id
          }
        })
        .then(
          (query): FinalizePendingWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.finalizePendingWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.error).toBeNull()
    })

    test("Can't finalize non-existent withdrawal", async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation FinalizePendingWithdrawal($withdrawalId: ID!) {
              finalizePendingWithdrawal(withdrawalId: $withdrawalId) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            withdrawalId: uuid()
          }
        })
        .then(
          (query): FinalizePendingWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.finalizePendingWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown withdrawal')
      expect(response.error).toEqual(WithdrawalError.UnknownWithdrawal)
    })

    test("Can't finalize invalid withdrawal id", async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation FinalizePendingWithdrawal($withdrawalId: ID!) {
              finalizePendingWithdrawal(withdrawalId: $withdrawalId) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            withdrawalId: 'not a uuid v4'
          }
        })
        .then(
          (query): FinalizePendingWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.finalizePendingWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Invalid id')
      expect(response.error).toEqual(WithdrawalError.InvalidId)
    })

    test("Can't finalize finalized withdrawal", async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(100)
      await appContainer.depositService.create({
        accountId,
        amount
      })
      const id = uuid()
      await appContainer.withdrawalService.create({
        id,
        accountId,
        amount
      })
      await appContainer.withdrawalService.finalize(id)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation FinalizePendingWithdrawal($withdrawalId: ID!) {
              finalizePendingWithdrawal(withdrawalId: $withdrawalId) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            withdrawalId: id
          }
        })
        .then(
          (query): FinalizePendingWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.finalizePendingWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Withdrawal already finalized')
      expect(response.error).toEqual(WithdrawalError.AlreadyFinalized)
    })

    test("Can't finalize rolled back withdrawal", async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(100)
      await appContainer.depositService.create({
        accountId,
        amount
      })
      const id = uuid()
      await appContainer.withdrawalService.create({
        id,
        accountId,
        amount
      })
      await appContainer.withdrawalService.rollback(id)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation FinalizePendingWithdrawal($withdrawalId: ID!) {
              finalizePendingWithdrawal(withdrawalId: $withdrawalId) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            withdrawalId: id
          }
        })
        .then(
          (query): FinalizePendingWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.finalizePendingWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Withdrawal already rolled back')
      expect(response.error).toEqual(WithdrawalError.AlreadyRolledBack)
    })
  })

  describe('Rollback Withdrawal', (): void => {
    test('Can rollback an ilp account withdrawal', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(100)
      await appContainer.depositService.create({
        accountId,
        amount
      })
      const id = uuid()
      await appContainer.withdrawalService.create({
        id,
        accountId,
        amount
      })
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RollbackPendingWithdrawal($withdrawalId: ID!) {
              rollbackPendingWithdrawal(withdrawalId: $withdrawalId) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            withdrawalId: id
          }
        })
        .then(
          (query): RollbackPendingWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.rollbackPendingWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.error).toBeNull()
    })

    test("Can't rollback non-existent withdrawal", async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RollbackPendingWithdrawal($withdrawalId: ID!) {
              rollbackPendingWithdrawal(withdrawalId: $withdrawalId) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            withdrawalId: uuid()
          }
        })
        .then(
          (query): RollbackPendingWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.rollbackPendingWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown withdrawal')
      expect(response.error).toEqual(WithdrawalError.UnknownWithdrawal)
    })

    test("Can't rollback invalid withdrawal id", async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RollbackPendingWithdrawal($withdrawalId: ID!) {
              rollbackPendingWithdrawal(withdrawalId: $withdrawalId) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            withdrawalId: 'not a uuid v4'
          }
        })
        .then(
          (query): RollbackPendingWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.rollbackPendingWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Invalid id')
      expect(response.error).toEqual(WithdrawalError.InvalidId)
    })

    test("Can't rollback finalized withdrawal", async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(100)
      await appContainer.depositService.create({
        accountId,
        amount
      })
      const id = uuid()
      await appContainer.withdrawalService.create({
        id,
        accountId,
        amount
      })
      await appContainer.withdrawalService.finalize(id)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RollbackPendingWithdrawal($withdrawalId: ID!) {
              rollbackPendingWithdrawal(withdrawalId: $withdrawalId) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            withdrawalId: id
          }
        })
        .then(
          (query): RollbackPendingWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.rollbackPendingWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Withdrawal already finalized')
      expect(response.error).toEqual(WithdrawalError.AlreadyFinalized)
    })

    test("Can't rollback rolled back withdrawal", async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(100)
      await appContainer.depositService.create({
        accountId,
        amount
      })
      const id = uuid()
      await appContainer.withdrawalService.create({
        id,
        accountId,
        amount
      })
      await appContainer.withdrawalService.rollback(id)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RollbackPendingWithdrawal($withdrawalId: ID!) {
              rollbackPendingWithdrawal(withdrawalId: $withdrawalId) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            withdrawalId: id
          }
        })
        .then(
          (query): RollbackPendingWithdrawalMutationResponse => {
            if (query.data) {
              return query.data.rollbackPendingWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Withdrawal already rolled back')
      expect(response.error).toEqual(WithdrawalError.AlreadyRolledBack)
    })
  })
})
