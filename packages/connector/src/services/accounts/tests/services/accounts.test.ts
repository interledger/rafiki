import { randomInt } from 'crypto'

import { Transaction as KnexTransaction } from 'knex'
import { Model, UniqueViolationError } from 'objection'
import { v4 as uuid } from 'uuid'

import { AccountsService } from '../../services/accounts'
import { toLiquidityIds, toSettlementIds, uuidToBigInt } from '../../utils'
import { createTestApp, TestContainer } from '../helpers/app'
import { AppServices, Config, IlpAccountSettings } from '../..'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../../../accounts'

import { AccountNotFoundError } from '../../../core/errors'
import { Transaction } from '../../../core/services/accounts'

// Use unique assets as a workaround for not being able to reset
// Tigerbeetle between tests
function randomAsset() {
  const letters = []
  while (letters.length < 3) {
    letters.push(randomInt(65, 91))
  }
  return {
    code: String.fromCharCode(...letters),
    scale: randomInt(0, 256)
  }
}

describe('Accounts Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accounts: AccountsService
  let trx: KnexTransaction

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      accounts = appContainer.app.getAccounts()
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

  describe('Create Account', (): void => {
    test('Can create an account', async (): Promise<void> => {
      const accountId = uuid()
      const account = {
        accountId,
        disabled: false,
        asset: randomAsset()
      }
      const createdAccount = await accounts.createAccount(account)
      expect(createdAccount).toEqual(account)
      const accountSettings = await IlpAccountSettings.query().findById(accountId)
      const balances = await appContainer.tigerbeetle.lookupAccounts([
        uuidToBigInt(accountSettings.balanceId),
        uuidToBigInt(accountSettings.debtBalanceId),
        uuidToBigInt(accountSettings.trustlineBalanceId)
      ])
      expect(balances.length).toBe(3)
      balances.forEach((balance) => {
        expect(balance.credit_reserved).toEqual(BigInt(0))
        expect(balance.credit_accepted).toEqual(BigInt(0))
      })
    })

    test('Can create an account with all settings', async (): Promise<void> => {
      const accountId = uuid()
      const account = {
        accountId,
        disabled: false,
        parentAccountId: uuid(),
        asset: randomAsset(),
        http: {
          incoming: {
            authTokens: [uuid()],
            endpoint: '/incomingEndpoint',
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        },
        stream: {
          enabled: true
        },
        routing: {
          staticIlpAddress: 'g.rafiki/' + accountId
        }
      }
      const createdAccount = await accounts.createAccount(account)
      expect(createdAccount).toEqual(account)
      const accountSettings = await IlpAccountSettings.query().findById(accountId)
      const balances = await appContainer.tigerbeetle.lookupAccounts([
        uuidToBigInt(accountSettings.balanceId),
        uuidToBigInt(accountSettings.debtBalanceId),
        uuidToBigInt(accountSettings.trustlineBalanceId)
      ])
      expect(balances.length).toBe(3)
      balances.forEach((balance) => {
        expect(balance.credit_reserved).toEqual(BigInt(0))
        expect(balance.credit_accepted).toEqual(BigInt(0))
      })
    })

    test('Cannot create an account with duplicate incoming tokens', async (): Promise<void> => {
      const accountId = uuid()
      const incomingToken = uuid()
      const account = {
        accountId,
        disabled: false,
        asset: randomAsset(),
        http: {
          incoming: {
            authTokens: [incomingToken, incomingToken],
            endpoint: '/incomingEndpoint'
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        }
      }

      await expect(accounts.createAccount(account)).rejects.toThrow(
        UniqueViolationError
      )

      const accountSettings = await IlpAccountSettings.query().findById(accountId)
      expect(accountSettings).toBeUndefined()
    })

    test('Cannot create an account with duplicate incoming token', async (): Promise<void> => {
      const incomingToken = uuid()
      {
        const account = {
          accountId: uuid(),
          disabled: false,
          asset: randomAsset(),
          http: {
            incoming: {
              authTokens: [incomingToken],
              endpoint: '/incomingEndpoint'
            },
            outgoing: {
              authToken: uuid(),
              endpoint: '/outgoingEndpoint'
            }
          }
        }
        await accounts.createAccount(account)
      }
      {
        const accountId = uuid()
        const account = {
          accountId,
          disabled: false,
          asset: randomAsset(),
          http: {
            incoming: {
              authTokens: [incomingToken],
              endpoint: '/incomingEndpoint'
            },
            outgoing: {
              authToken: uuid(),
              endpoint: '/outgoingEndpoint'
            }
          }
        }
        await expect(accounts.createAccount(account)).rejects.toThrow(
          UniqueViolationError
        )
        const accountSettings = await IlpAccountSettings.query().findById(accountId)
        expect(accountSettings).toBeUndefined()
      }
    })

    test('Auto-creates corresponding liquidity and settlement accounts', async (): Promise<void> => {
      const asset = randomAsset()
      const account = {
        accountId: uuid(),
        disabled: false,
        asset
      }

      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          ...Object.values(toLiquidityIds(asset.code, asset.scale)),
          ...Object.values(toSettlementIds(asset.code, asset.scale))
        ])
        expect(balances.length).toBe(0)
      }

      await accounts.createAccount(account)
      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          ...Object.values(toLiquidityIds(asset.code, asset.scale)),
          ...Object.values(toSettlementIds(asset.code, asset.scale))
        ])
        expect(balances.length).toBe(6)
        balances.forEach((balance) => {
          expect(balance.credit_reserved).toEqual(BigInt(0))
          expect(balance.credit_accepted).toEqual(BigInt(0))
        })
      }

      await accounts.createAccount({
        ...account,
        accountId: uuid()
      })

      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          ...Object.values(toLiquidityIds(asset.code, asset.scale)),
          ...Object.values(toSettlementIds(asset.code, asset.scale))
        ])
        expect(balances.length).toBe(6)
      }
    })
  })

  describe('Get Account Balance', (): void => {
    test("Can retrieve an account's balance", async (): Promise<void> => {
      const { accountId } = await accounts.createAccount({
        accountId: uuid(),
        disabled: false,
        asset: randomAsset()
      })
      const balance = await accounts.getAccountBalance(accountId)
      expect(balance).toEqual({
        id: accountId,
        balance: BigInt(0),
        parent: {
          availableCreditLine: BigInt(0),
          totalBorrowed: BigInt(0)
        }
      })
    })
  })

  describe('Deposit liquidity', (): void => {
    test('Can deposit to liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      const amount = BigInt(10)
      {
        await accounts.depositLiquidity(asset.code, asset.scale, amount)
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount)
        const settlementBalance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(settlementBalance).toEqual(-amount)
      }
      const amount2 = BigInt(5)
      {
        await accounts.depositLiquidity(asset.code, asset.scale, amount2)
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount + amount2)
        const settlementBalance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(settlementBalance).toEqual(-(amount + amount2))
      }
    })
  })

  describe('Withdraw liquidity', (): void => {
    test('Can withdraw liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      const startingBalance = BigInt(10)
      await accounts.depositLiquidity(asset.code, asset.scale, startingBalance)
      const amount = BigInt(5)
      {
        await accounts.withdrawLiquidity(asset.code, asset.scale, amount)
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(startingBalance - amount)
        const settlementBalance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(settlementBalance).toEqual(-(startingBalance - amount))
      }
      const amount2 = BigInt(5)
      {
        await accounts.withdrawLiquidity(asset.code, asset.scale, amount2)
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(startingBalance - amount - amount2)
        const settlementBalance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(settlementBalance).toEqual(-(startingBalance - amount - amount2))
      }
    })

    test.skip("Can't withdraw more than the balance", async (): Promise<void> => {
      const asset = randomAsset()
      const startingBalance = BigInt(5)
      await accounts.depositLiquidity(asset.code, asset.scale, startingBalance)
      const amount = BigInt(10)
      await accounts.withdrawLiquidity(asset.code, asset.scale, amount)
      const balance = await accounts.getLiquidityBalance(
        asset.code,
        asset.scale
      )
      expect(balance).toEqual(startingBalance)
      const settlementBalance = await accounts.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(-startingBalance)
    })
  })

  describe('Account Deposit', (): void => {
    test('Can deposit to account', async (): Promise<void> => {
      const { accountId, asset } = await accounts.createAccount({
        accountId: uuid(),
        disabled: false,
        asset: randomAsset()
      })
      const amount = BigInt(10)
      await accounts.deposit(accountId, amount)
      const { balance } = await accounts.getAccountBalance(accountId)
      expect(balance).toEqual(amount)
      const settlementBalance = await accounts.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(-amount)
    })

    test("Can't deposit to nonexistent account", async (): Promise<void> => {
      const id = uuid()
      await expect(accounts.deposit(id, BigInt(5))).rejects.toThrowError(
        new AccountNotFoundError(id)
      )
    })
  })

  describe('Account Withdraw', (): void => {
    test('Can withdraw from account', async (): Promise<void> => {
      const { accountId, asset } = await accounts.createAccount({
        accountId: uuid(),
        disabled: false,
        asset: randomAsset()
      })
      const startingBalance = BigInt(10)
      await accounts.deposit(accountId, startingBalance)
      const amount = BigInt(5)
      await accounts.withdraw(accountId, amount)
      const { balance } = await accounts.getAccountBalance(accountId)
      expect(balance).toEqual(startingBalance - amount)
      const settlementBalance = await accounts.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(-(startingBalance - amount))
    })

    test("Can't withdraw from nonexistent account", async (): Promise<void> => {
      const id = uuid()
      await expect(accounts.withdraw(id, BigInt(5))).rejects.toThrowError(
        new AccountNotFoundError(id)
      )
    })

    test.skip("Can't withdraw more than the balance", async (): Promise<void> => {
      const { accountId, asset } = await accounts.createAccount({
        accountId: uuid(),
        disabled: false,
        asset: randomAsset()
      })
      const startingBalance = BigInt(5)
      await accounts.deposit(accountId, startingBalance)
      const amount = BigInt(10)
      await accounts.withdraw(accountId, amount)
      const { balance } = await accounts.getAccountBalance(accountId)
      expect(balance).toEqual(startingBalance)
      const settlementBalance = await accounts.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(-startingBalance)
    })
  })

  describe('Adjust Balances', (): void => {
    test.each([['accept'], ['reject']])(
      'Can adjust balances for %sed two-phase commit transactions',
      async (result): Promise<void> => {
        const asset = randomAsset()
        const { accountId: sourceAccountId } = await accounts.createAccount({
          accountId: uuid(),
          disabled: false,
          asset
        })
        const { accountId: destinationAccountId } = await accounts.createAccount({
          accountId: uuid(),
          disabled: false,
          asset
        })
        const startingSourceBalance = BigInt(10)
        await accounts.deposit(sourceAccountId, startingSourceBalance)

        const amount = BigInt(1)
        await accounts.adjustBalances({
          sourceAmount: amount,
          sourceAccountId,
          destinationAccountId,
          callback: async (trx: Transaction) => {
            {
              const {
                balance: sourceBalance
              } = await accounts.getAccountBalance(sourceAccountId)
              expect(sourceBalance).toEqual(startingSourceBalance - amount)

              const {
                balance: destinationBalance
              } = await accounts.getAccountBalance(destinationAccountId)
              expect(destinationBalance).toEqual(BigInt(0))

              const liquidityBalance = await accounts.getLiquidityBalance(
                asset.code,
                asset.scale
              )
              expect(liquidityBalance).toEqual(-amount)
            }

            if (result === 'accept') {
              await trx.commit()
            } else {
              await trx.rollback()
            }

            {
              const {
                balance: sourceBalance
              } = await accounts.getAccountBalance(sourceAccountId)
              const expectedSourceBalance =
                result === 'accept'
                  ? startingSourceBalance - amount
                  : startingSourceBalance
              expect(sourceBalance).toEqual(expectedSourceBalance)

              const {
                balance: destinationBalance
              } = await accounts.getAccountBalance(destinationAccountId)
              const expectedDestinationBalance =
                result === 'accept' ? amount : BigInt(0)
              expect(destinationBalance).toEqual(expectedDestinationBalance)

              const liquidityBalance = await accounts.getLiquidityBalance(
                asset.code,
                asset.scale
              )
              expect(liquidityBalance).toEqual(BigInt(0))
            }
          }
        })
      }
    )
  })

  describe('Account Tokens', (): void => {
    test('Can retrieve account by incoming token', async (): Promise<void> => {
      const incomingToken = uuid()
      const { accountId } = await accounts.createAccount({
        accountId: uuid(),
        disabled: false,
        asset: randomAsset(),
        http: {
          incoming: {
            authTokens: [incomingToken, uuid()],
            endpoint: '/incomingEndpoint'
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        }
      })
      const account = await accounts.getAccountByToken(incomingToken)
      expect(account).not.toBeNull()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(account!.accountId).toEqual(accountId)
    })

    test('Returns null if no account exists with token', async (): Promise<void> => {
      const account = await accounts.getAccountByToken(uuid())
      expect(account).toBeNull()
    })
  })
})
