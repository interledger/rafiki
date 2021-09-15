import { Model } from 'objection'
import { Transaction } from 'knex'
import { v4 as uuid } from 'uuid'

import { AccountFactory } from '../../testsHelpers'
import {
  CreditError,
  ExtendCreditMutationResponse,
  RevokeCreditMutationResponse,
  UtilizeCreditMutationResponse,
  SettleDebtMutationResponse
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
      accountFactory = new AccountFactory(appContainer.accountService)
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
          await appContainer.depositService.create({
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
                  error
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
        expect(response.error).toBeNull()

        await expect(
          appContainer.accountService.getBalance(accountId)
        ).resolves.toEqual({
          balance: autoApply ? depositAmount - amount : BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: autoApply ? BigInt(0) : amount,
          totalBorrowed: BigInt(0),
          totalLent: autoApply ? amount : BigInt(0)
        })
        await expect(
          appContainer.accountService.getBalance(subAccountId)
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
                error
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
      expect(response.error).toEqual(CreditError.UnknownAccount)
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
                error
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
      expect(response.error).toEqual(CreditError.UnknownSubAccount)
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
                error
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
      expect(response.error).toEqual(CreditError.UnrelatedSubAccount)
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
                error
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
      expect(response.error).toEqual(CreditError.UnrelatedSubAccount)
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
                error
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
      expect(response.error).toEqual(CreditError.SameAccounts)
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
                error
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
      expect(response.error).toEqual(CreditError.InsufficientBalance)
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
        appContainer.creditService.extend({
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
                error
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
      expect(response.error).toBeNull()

      await expect(
        appContainer.accountService.getBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: creditAmount - amount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        appContainer.accountService.getBalance(subAccountId)
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
                error
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
      expect(response.error).toEqual(CreditError.UnknownAccount)
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
                error
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
      expect(response.error).toEqual(CreditError.UnknownSubAccount)
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
                error
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
      expect(response.error).toEqual(CreditError.UnrelatedSubAccount)
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
                error
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
      expect(response.error).toEqual(CreditError.UnrelatedSubAccount)
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
                error
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
      expect(response.error).toEqual(CreditError.SameAccounts)
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
                error
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
      expect(response.error).toEqual(CreditError.InsufficientCredit)
    })
  })

  describe('Utilize Credit', (): void => {
    test('Can utilize credit to sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(10)
      await expect(
        appContainer.creditService.extend({
          accountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()

      await appContainer.depositService.create({
        accountId,
        amount: creditAmount
      })

      const amount = BigInt(5)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UtilizeCredit($input: UtilizeCreditInput!) {
              utilizeCredit(input: $input) {
                code
                success
                message
                error
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
          (query): UtilizeCreditMutationResponse => {
            if (query.data) {
              return query.data.utilizeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.error).toBeNull()

      await expect(
        appContainer.accountService.getBalance(accountId)
      ).resolves.toEqual({
        balance: creditAmount - amount,
        availableCredit: BigInt(0),
        creditExtended: creditAmount - amount,
        totalBorrowed: BigInt(0),
        totalLent: amount
      })
      await expect(
        appContainer.accountService.getBalance(subAccountId)
      ).resolves.toEqual({
        balance: amount,
        availableCredit: creditAmount - amount,
        creditExtended: BigInt(0),
        totalBorrowed: amount,
        totalLent: BigInt(0)
      })
    })

    test('Returns error for nonexistent account', async (): Promise<void> => {
      const { id: subAccountId } = await accountFactory.build()

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UtilizeCredit($input: UtilizeCreditInput!) {
              utilizeCredit(input: $input) {
                code
                success
                message
                error
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
          (query): UtilizeCreditMutationResponse => {
            if (query.data) {
              return query.data.utilizeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown account')
      expect(response.error).toEqual(CreditError.UnknownAccount)
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UtilizeCredit($input: UtilizeCreditInput!) {
              utilizeCredit(input: $input) {
                code
                success
                message
                error
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
          (query): UtilizeCreditMutationResponse => {
            if (query.data) {
              return query.data.utilizeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown sub-account')
      expect(response.error).toEqual(CreditError.UnknownSubAccount)
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: unrelatedAccountId } = await accountFactory.build()

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UtilizeCredit($input: UtilizeCreditInput!) {
              utilizeCredit(input: $input) {
                code
                success
                message
                error
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
          (query): UtilizeCreditMutationResponse => {
            if (query.data) {
              return query.data.utilizeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Unrelated sub-account')
      expect(response.error).toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UtilizeCredit($input: UtilizeCreditInput!) {
              utilizeCredit(input: $input) {
                code
                success
                message
                error
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
          (query): UtilizeCreditMutationResponse => {
            if (query.data) {
              return query.data.utilizeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Unrelated sub-account')
      expect(response.error).toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UtilizeCredit($input: UtilizeCreditInput!) {
              utilizeCredit(input: $input) {
                code
                success
                message
                error
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
          (query): UtilizeCreditMutationResponse => {
            if (query.data) {
              return query.data.utilizeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Same accounts')
      expect(response.error).toEqual(CreditError.SameAccounts)
    })

    test('Returns error for insufficient credit balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UtilizeCredit($input: UtilizeCreditInput!) {
              utilizeCredit(input: $input) {
                code
                success
                message
                error
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
          (query): UtilizeCreditMutationResponse => {
            if (query.data) {
              return query.data.utilizeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('403')
      expect(response.message).toEqual('Insufficient credit')
      expect(response.error).toEqual(CreditError.InsufficientCredit)
    })

    test('Returns error for insufficient account balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const amount = BigInt(10)
      await expect(
        appContainer.creditService.extend({
          accountId,
          subAccountId,
          amount
        })
      ).resolves.toBeUndefined()

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UtilizeCredit($input: UtilizeCreditInput!) {
              utilizeCredit(input: $input) {
                code
                success
                message
                error
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
          (query): UtilizeCreditMutationResponse => {
            if (query.data) {
              return query.data.utilizeCredit
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('403')
      expect(response.message).toEqual('Insufficient balance')
      expect(response.error).toEqual(CreditError.InsufficientBalance)
    })
  })

  describe('Settle Debt', (): void => {
    test.each`
      revolve
      ${undefined}
      ${false}
      ${true}
    `(
      'Can settle sub-account debt { revolve: $revolve }',
      async ({ revolve }): Promise<void> => {
        const { id: accountId } = await accountFactory.build()
        const { id: subAccountId } = await accountFactory.build({
          superAccountId: accountId
        })

        const creditAmount = BigInt(10)
        await appContainer.depositService.create({
          accountId,
          amount: creditAmount
        })
        await expect(
          appContainer.creditService.extend({
            accountId,
            subAccountId,
            amount: creditAmount,
            autoApply: true
          })
        ).resolves.toBeUndefined()

        const amount = BigInt(1)
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation SettleDebt($input: SettleDebtInput!) {
                settleDebt(input: $input) {
                  code
                  success
                  message
                  error
                }
              }
            `,
            variables: {
              input: {
                accountId,
                subAccountId,
                amount: amount.toString(),
                revolve
              }
            }
          })
          .then(
            (query): SettleDebtMutationResponse => {
              if (query.data) {
                return query.data.settleDebt
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        expect(response.error).toBeNull()

        await expect(
          appContainer.accountService.getBalance(accountId)
        ).resolves.toEqual({
          balance: amount,
          availableCredit: BigInt(0),
          creditExtended: revolve === false ? BigInt(0) : amount,
          totalBorrowed: BigInt(0),
          totalLent: creditAmount - amount
        })
        await expect(
          appContainer.accountService.getBalance(subAccountId)
        ).resolves.toEqual({
          balance: creditAmount - amount,
          availableCredit: revolve === false ? BigInt(0) : amount,
          creditExtended: BigInt(0),
          totalBorrowed: creditAmount - amount,
          totalLent: BigInt(0)
        })
      }
    )

    test('Returns error for nonexistent account', async (): Promise<void> => {
      const { id: subAccountId } = await accountFactory.build()

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation SettleDebt($input: SettleDebtInput!) {
              settleDebt(input: $input) {
                code
                success
                message
                error
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
          (query): SettleDebtMutationResponse => {
            if (query.data) {
              return query.data.settleDebt
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown account')
      expect(response.error).toEqual(CreditError.UnknownAccount)
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation SettleDebt($input: SettleDebtInput!) {
              settleDebt(input: $input) {
                code
                success
                message
                error
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
          (query): SettleDebtMutationResponse => {
            if (query.data) {
              return query.data.settleDebt
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown sub-account')
      expect(response.error).toEqual(CreditError.UnknownSubAccount)
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: unrelatedAccountId } = await accountFactory.build()

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation SettleDebt($input: SettleDebtInput!) {
              settleDebt(input: $input) {
                code
                success
                message
                error
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
          (query): SettleDebtMutationResponse => {
            if (query.data) {
              return query.data.settleDebt
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Unrelated sub-account')
      expect(response.error).toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation SettleDebt($input: SettleDebtInput!) {
              settleDebt(input: $input) {
                code
                success
                message
                error
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
          (query): SettleDebtMutationResponse => {
            if (query.data) {
              return query.data.settleDebt
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Unrelated sub-account')
      expect(response.error).toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation SettleDebt($input: SettleDebtInput!) {
              settleDebt(input: $input) {
                code
                success
                message
                error
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
          (query): SettleDebtMutationResponse => {
            if (query.data) {
              return query.data.settleDebt
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Same accounts')
      expect(response.error).toEqual(CreditError.SameAccounts)
    })

    test('Returns error if amount exceeds debt', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation SettleDebt($input: SettleDebtInput!) {
              settleDebt(input: $input) {
                code
                success
                message
                error
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
          (query): SettleDebtMutationResponse => {
            if (query.data) {
              return query.data.settleDebt
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('403')
      expect(response.message).toEqual('Insufficient debt')
      expect(response.error).toEqual(CreditError.InsufficientDebt)
    })

    test('Returns error for insufficient sub-account balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const lentAmount = BigInt(5)
      await appContainer.depositService.create({
        accountId,
        amount: lentAmount
      })
      await expect(
        appContainer.creditService.extend({
          accountId,
          subAccountId,
          amount: lentAmount,
          autoApply: true
        })
      ).resolves.toBeUndefined()

      const withdrawAmount = BigInt(1)
      await appContainer.withdrawalService.create({
        accountId: subAccountId,
        amount: withdrawAmount
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation SettleDebt($input: SettleDebtInput!) {
              settleDebt(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              accountId,
              subAccountId,
              amount: lentAmount.toString()
            }
          }
        })
        .then(
          (query): SettleDebtMutationResponse => {
            if (query.data) {
              return query.data.settleDebt
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('403')
      expect(response.message).toEqual('Insufficient balance')
      expect(response.error).toEqual(CreditError.InsufficientBalance)
    })
  })
})
