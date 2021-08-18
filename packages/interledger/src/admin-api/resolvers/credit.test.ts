import { Model } from 'objection'
import { Transaction } from 'knex'
import { v4 as uuid } from 'uuid'

import { AccountFactory } from '../../accounts/testsHelpers'
import {
  ExtendCreditMutationResponse,
  RevokeCreditMutationResponse
} from '../generated/graphql'
import { gql } from 'apollo-server'

import { createTestApp, TestContainer } from '../testsHelpers/app'

describe('Credit Resolvers', (): void => {
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

  describe('Extend Credit', (): void => {
    test.each`
      autoApply
      ${undefined}
      ${false}
      ${true}
    `(
      'Can extend credit to sub-account { autoApply: $autoApply }',
      async ({ autoApply }): Promise<void> => {
        const { id: accountId } = await accountFactory.build()
        const { id: subAccountId } = await accountFactory.build({
          superAccountId: accountId
        })

        const depositAmount = BigInt(20)
        if (autoApply) {
          await appContainer.accountsService.deposit({
            accountId,
            amount: depositAmount
          })
        }

        const amount = BigInt(5)

        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation ExtendCredit($input: ExtendCreditInput!) {
                extendCredit(input: $input) {
                  code
                  success
                  message
                }
              }
            `,
            variables: {
              input: {
                accountId,
                subAccountId,
                amount: amount.toString(),
                autoApply
              }
            }
          })
          .then(
            (query): ExtendCreditMutationResponse => {
              if (query.data) {
                return query.data.extendCredit
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')

        await expect(
          appContainer.accountsService.getAccountBalance(accountId)
        ).resolves.toEqual({
          balance: autoApply ? depositAmount - amount : BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: autoApply ? BigInt(0) : amount,
          totalBorrowed: BigInt(0),
          totalLent: autoApply ? amount : BigInt(0)
        })
        await expect(
          appContainer.accountsService.getAccountBalance(subAccountId)
        ).resolves.toEqual({
          balance: autoApply ? amount : BigInt(0),
          availableCredit: autoApply ? BigInt(0) : amount,
          creditExtended: BigInt(0),
          totalBorrowed: autoApply ? amount : BigInt(0),
          totalLent: BigInt(0)
        })
      }
    )

    test('Returns error for nonexistent account', async (): Promise<void> => {
      const { id: subAccountId } = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation ExtendCredit($input: ExtendCreditInput!) {
              extendCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId: uuid(),
              subAccountId,
              amount: '5'
            }
          }
        })
        .then(
          (query): ExtendCreditMutationResponse => {
            if (query.data) {
              return query.data.extendCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown account')
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation ExtendCredit($input: ExtendCreditInput!) {
              extendCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId,
              subAccountId: uuid(),
              amount: '5'
            }
          }
        })
        .then(
          (query): ExtendCreditMutationResponse => {
            if (query.data) {
              return query.data.extendCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown sub-account')
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: unrelatedAccountId } = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation ExtendCredit($input: ExtendCreditInput!) {
              extendCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId,
              subAccountId: unrelatedAccountId,
              amount: '5'
            }
          }
        })
        .then(
          (query): ExtendCreditMutationResponse => {
            if (query.data) {
              return query.data.extendCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Unrelated sub-account')
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation ExtendCredit($input: ExtendCreditInput!) {
              extendCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId: subAccountId,
              subAccountId: accountId,
              amount: '5'
            }
          }
        })
        .then(
          (query): ExtendCreditMutationResponse => {
            if (query.data) {
              return query.data.extendCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Unrelated sub-account')
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation ExtendCredit($input: ExtendCreditInput!) {
              extendCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId,
              subAccountId: accountId,
              amount: '5'
            }
          }
        })
        .then(
          (query): ExtendCreditMutationResponse => {
            if (query.data) {
              return query.data.extendCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Same accounts')
    })

    test('Returns error for insufficient account balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation ExtendCredit($input: ExtendCreditInput!) {
              extendCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId,
              subAccountId,
              amount: '5',
              autoApply: true
            }
          }
        })
        .then(
          (query): ExtendCreditMutationResponse => {
            if (query.data) {
              return query.data.extendCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('403')
      expect(response.message).toEqual('Insufficient balance')
    })
  })

  describe('Revoke Credit', (): void => {
    test('Can revoke credit to sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(10)
      await expect(
        appContainer.accountsService.extendCredit({
          accountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()

      const amount = BigInt(5)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RevokeCredit($input: RevokeCreditInput!) {
              revokeCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId,
              subAccountId,
              amount: amount.toString()
            }
          }
        })
        .then(
          (query): RevokeCreditMutationResponse => {
            if (query.data) {
              return query.data.revokeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')

      await expect(
        appContainer.accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: creditAmount - amount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        appContainer.accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount - amount,
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
    })

    test('Returns error for nonexistent account', async (): Promise<void> => {
      const { id: subAccountId } = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RevokeCredit($input: RevokeCreditInput!) {
              revokeCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId: uuid(),
              subAccountId,
              amount: '5'
            }
          }
        })
        .then(
          (query): RevokeCreditMutationResponse => {
            if (query.data) {
              return query.data.revokeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown account')
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RevokeCredit($input: RevokeCreditInput!) {
              revokeCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId,
              subAccountId: uuid(),
              amount: '5'
            }
          }
        })
        .then(
          (query): RevokeCreditMutationResponse => {
            if (query.data) {
              return query.data.revokeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown sub-account')
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: unrelatedAccountId } = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RevokeCredit($input: RevokeCreditInput!) {
              revokeCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId,
              subAccountId: unrelatedAccountId,
              amount: '5'
            }
          }
        })
        .then(
          (query): RevokeCreditMutationResponse => {
            if (query.data) {
              return query.data.revokeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Unrelated sub-account')
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RevokeCredit($input: RevokeCreditInput!) {
              revokeCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId: subAccountId,
              subAccountId: accountId,
              amount: '5'
            }
          }
        })
        .then(
          (query): RevokeCreditMutationResponse => {
            if (query.data) {
              return query.data.revokeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Unrelated sub-account')
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RevokeCredit($input: RevokeCreditInput!) {
              revokeCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId,
              subAccountId: accountId,
              amount: '5'
            }
          }
        })
        .then(
          (query): RevokeCreditMutationResponse => {
            if (query.data) {
              return query.data.revokeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Same accounts')
    })

    test('Returns error for insufficient credit balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RevokeCredit($input: RevokeCreditInput!) {
              revokeCredit(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input: {
              accountId,
              subAccountId,
              amount: '5'
            }
          }
        })
        .then(
          (query): RevokeCreditMutationResponse => {
            if (query.data) {
              return query.data.revokeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('403')
      expect(response.message).toEqual('Insufficient credit')
    })
  })
})
