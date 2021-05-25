import { randomInt } from 'crypto'

import { Transaction as KnexTransaction } from 'knex'
import { Model, UniqueViolationError } from 'objection'
import { v4 as uuid } from 'uuid'

import {
  toLiquidityId,
  toSettlementId,
  toSettlementCreditId,
  toSettlementLoanId,
  uuidToBigInt
} from '../../utils'
import { createTestApp, TestContainer } from '../helpers/app'
import {
  Account,
  AccountsService,
  AppServices,
  Config,
  InvalidAssetError,
  UnknownAccountError,
  UnknownBalanceError,
  UpdateIlpAccountOptions
} from '../..'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../../../accounts'

import { CreateOptions, Transaction } from '../../../core/services/accounts'

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
  let config: typeof Config
  let trx: KnexTransaction

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      accounts = appContainer.app.getAccounts()
      config = appContainer.app.getConfig()
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
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      }
      const createdAccount = await accounts.createAccount(account)
      const expectedAccount = {
        ...account,
        disabled: false,
        stream: {
          enabled: false
        }
      }
      expect(createdAccount).toEqual(expectedAccount)
      const retrievedAccount = await Account.query().findById(accountId)
      const balances = await appContainer.tigerbeetle.lookupAccounts([
        uuidToBigInt(retrievedAccount.balanceId),
        uuidToBigInt(retrievedAccount.debtBalanceId),
        uuidToBigInt(retrievedAccount.trustlineBalanceId)
      ])
      expect(balances.length).toBe(3)
      balances.forEach((balance) => {
        expect(balance.credit_reserved).toEqual(BigInt(0))
        expect(balance.credit_accepted).toEqual(BigInt(0))
      })
    })

    test('Can create an account with all settings', async (): Promise<void> => {
      const accountId = uuid()
      const account: CreateOptions = {
        accountId,
        disabled: false,
        asset: randomAsset(),
        maxPacketAmount: BigInt(100),
        http: {
          incoming: {
            authTokens: [uuid()]
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
          staticIlpAddress: 'g.rafiki.' + accountId
        }
      }
      const createdAccount = await accounts.createAccount(account)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      delete account.http!.incoming
      expect(createdAccount).toEqual(account)
      const retrievedAccount = await Account.query().findById(accountId)
      const balances = await appContainer.tigerbeetle.lookupAccounts([
        uuidToBigInt(retrievedAccount.balanceId),
        uuidToBigInt(retrievedAccount.debtBalanceId),
        uuidToBigInt(retrievedAccount.trustlineBalanceId)
      ])
      expect(balances.length).toBe(3)
      balances.forEach((balance) => {
        expect(balance.credit_reserved).toEqual(BigInt(0))
        expect(balance.credit_accepted).toEqual(BigInt(0))
      })
    })

    test('Cannot create an account with non-existent parent', async (): Promise<void> => {
      const parentAccountId = uuid()
      const asset = randomAsset()
      const account = {
        accountId: uuid(),
        asset,
        maxPacketAmount: BigInt(100),
        parentAccountId
      }

      await expect(accounts.createAccount(account)).rejects.toThrow(
        UnknownAccountError
      )

      await accounts.createAccount({
        accountId: parentAccountId,
        disabled: false,
        asset,
        maxPacketAmount: BigInt(100)
      })

      await accounts.createAccount(account)
    })

    test('Cannot create an account with different asset than parent', async (): Promise<void> => {
      const { accountId: parentAccountId } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })

      const asset = randomAsset()
      await expect(
        accounts.createAccount({
          accountId: uuid(),
          disabled: false,
          asset,
          maxPacketAmount: BigInt(100),
          parentAccountId
        })
      ).rejects.toThrowError(new InvalidAssetError(asset.code, asset.scale))
    })

    test("Auto-creates parent account's credit and loan balances", async (): Promise<void> => {
      const {
        accountId: parentAccountId,
        asset
      } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })

      {
        const {
          creditBalanceId,
          loanBalanceId
        } = await Account.query()
          .findById(parentAccountId)
          .select('creditBalanceId', 'loanBalanceId')
        expect(creditBalanceId).toBeNull()
        expect(loanBalanceId).toBeNull()
      }

      await accounts.createAccount({
        accountId: uuid(),
        asset,
        maxPacketAmount: BigInt(100),
        parentAccountId
      })

      {
        const {
          creditBalanceId,
          loanBalanceId
        } = await Account.query()
          .findById(parentAccountId)
          .select('creditBalanceId', 'loanBalanceId')
        expect(creditBalanceId).not.toBeNull()
        expect(loanBalanceId).not.toBeNull()

        if (creditBalanceId && loanBalanceId) {
          const balances = await appContainer.tigerbeetle.lookupAccounts([
            uuidToBigInt(creditBalanceId),
            uuidToBigInt(loanBalanceId)
          ])
          expect(balances.length).toBe(2)
          balances.forEach((balance) => {
            expect(balance.credit_reserved).toEqual(BigInt(0))
            expect(balance.credit_accepted).toEqual(BigInt(0))
          })
        } else {
          fail()
        }
      }
    })

    test('Cannot create an account with duplicate incoming tokens', async (): Promise<void> => {
      const accountId = uuid()
      const incomingToken = uuid()
      const account = {
        accountId,
        asset: randomAsset(),
        maxPacketAmount: BigInt(100),
        http: {
          incoming: {
            authTokens: [incomingToken, incomingToken]
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

      const retrievedAccount = await Account.query().findById(accountId)
      expect(retrievedAccount).toBeUndefined()
    })

    test('Cannot create an account with duplicate incoming token', async (): Promise<void> => {
      const incomingToken = uuid()
      {
        const account = {
          accountId: uuid(),
          asset: randomAsset(),
          maxPacketAmount: BigInt(100),
          http: {
            incoming: {
              authTokens: [incomingToken]
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
          asset: randomAsset(),
          maxPacketAmount: BigInt(100),
          http: {
            incoming: {
              authTokens: [incomingToken]
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
        const retrievedAccount = await Account.query().findById(accountId)
        expect(retrievedAccount).toBeUndefined()
      }
    })

    test('Auto-creates corresponding liquidity and settlement accounts', async (): Promise<void> => {
      const asset = randomAsset()
      const account = {
        accountId: uuid(),
        asset,
        maxPacketAmount: BigInt(100)
      }

      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          toLiquidityId(asset.code, asset.scale),
          toSettlementId(asset.code, asset.scale),
          toSettlementCreditId(asset.code, asset.scale),
          toSettlementLoanId(asset.code, asset.scale)
        ])
        expect(balances.length).toBe(0)
      }

      await accounts.createAccount(account)
      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          toLiquidityId(asset.code, asset.scale),
          toSettlementId(asset.code, asset.scale),
          toSettlementCreditId(asset.code, asset.scale),
          toSettlementLoanId(asset.code, asset.scale)
        ])
        expect(balances.length).toBe(4)
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
          toLiquidityId(asset.code, asset.scale),
          toSettlementId(asset.code, asset.scale),
          toSettlementCreditId(asset.code, asset.scale),
          toSettlementLoanId(asset.code, asset.scale)
        ])
        expect(balances.length).toBe(4)
      }
    })
  })

  describe('Get Account', (): void => {
    test('Can get an account', async (): Promise<void> => {
      const account = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })
      const retrievedAccount = await accounts.getAccount(account.accountId)
      expect(retrievedAccount).toEqual(account)
    })

    test('Throws for nonexistent account', async (): Promise<void> => {
      await expect(accounts.getAccount(uuid())).rejects.toThrow(
        UnknownAccountError
      )
    })
  })

  describe('Update Account', (): void => {
    test('Can update an account', async (): Promise<void> => {
      const { accountId, asset } = await accounts.createAccount({
        accountId: uuid(),
        disabled: false,
        asset: randomAsset(),
        maxPacketAmount: BigInt(100),
        http: {
          incoming: {
            authTokens: [uuid()]
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        },
        stream: {
          enabled: true
        }
      })
      const updateOptions: UpdateIlpAccountOptions = {
        accountId,
        disabled: true,
        maxPacketAmount: BigInt(200),
        http: {
          incoming: {
            authTokens: [uuid()]
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoing'
          }
        },
        stream: {
          enabled: false
        }
      }
      const updatedAccount = await accounts.updateAccount(updateOptions)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      delete updateOptions.http!.incoming
      const expectedAccount = {
        ...updateOptions,
        asset
      }
      expect(updatedAccount).toEqual(expectedAccount)
      const account = await accounts.getAccount(accountId)
      expect(account).toEqual(expectedAccount)
    })

    test('Cannot update nonexistent account', async (): Promise<void> => {
      const updateOptions: UpdateIlpAccountOptions = {
        accountId: uuid(),
        disabled: true
      }

      await expect(accounts.updateAccount(updateOptions)).rejects.toThrow(
        UnknownAccountError
      )
    })
  })

  describe('Get Account Balance', (): void => {
    test("Can retrieve an account's balance", async (): Promise<void> => {
      const { accountId, asset } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })

      {
        const balance = await accounts.getAccountBalance(accountId)
        expect(balance).toEqual({
          id: accountId,
          balance: BigInt(0),
          parent: {
            availableCreditLine: BigInt(0),
            totalBorrowed: BigInt(0)
          }
        })
      }

      await accounts.createAccount({
        accountId: uuid(),
        asset,
        maxPacketAmount: BigInt(100),
        parentAccountId: accountId
      })

      {
        const balance = await accounts.getAccountBalance(accountId)
        expect(balance).toEqual({
          id: accountId,
          balance: BigInt(0),
          children: {
            availableCredit: BigInt(0),
            totalLent: BigInt(0)
          },
          parent: {
            availableCreditLine: BigInt(0),
            totalBorrowed: BigInt(0)
          }
        })
      }
    })

    test('Throws for nonexistent account', async (): Promise<void> => {
      await expect(accounts.getAccountBalance(uuid())).rejects.toThrow(
        UnknownAccountError
      )
    })
  })

  describe('Get Liquidity Balance', (): void => {
    test('Can retrieve liquidity account balance', async (): Promise<void> => {
      const { asset } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })

      {
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(BigInt(0))
      }

      const amount = BigInt(10)
      await accounts.depositLiquidity(asset.code, asset.scale, amount)

      {
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount)
      }
    })

    test('Throws for nonexistent liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      await expect(
        accounts.getLiquidityBalance(asset.code, asset.scale)
      ).rejects.toThrow(UnknownBalanceError)
    })
  })

  describe('Get Settlement Balance', (): void => {
    test('Can retrieve settlement account balance', async (): Promise<void> => {
      const { asset } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })

      {
        const balance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(BigInt(0))
      }

      const amount = BigInt(10)
      await accounts.depositLiquidity(asset.code, asset.scale, amount)

      {
        const balance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(-amount)
      }
    })

    test('Throws for nonexistent settlement account', async (): Promise<void> => {
      const asset = randomAsset()
      await expect(
        accounts.getSettlementBalance(asset.code, asset.scale)
      ).rejects.toThrow(UnknownBalanceError)
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
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
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
      await expect(accounts.deposit(id, BigInt(5))).rejects.toThrow(
        UnknownAccountError
      )
    })
  })

  describe('Account Withdraw', (): void => {
    test('Can withdraw from account', async (): Promise<void> => {
      const { accountId, asset } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
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
      await expect(accounts.withdraw(id, BigInt(5))).rejects.toThrow(
        UnknownAccountError
      )
    })

    test.skip("Can't withdraw more than the balance", async (): Promise<void> => {
      const { accountId, asset } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
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
          asset,
          maxPacketAmount: BigInt(100)
        })
        const {
          accountId: destinationAccountId
        } = await accounts.createAccount({
          accountId: uuid(),
          asset,
          maxPacketAmount: BigInt(100)
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

    test('Throws for nonexistent account', async (): Promise<void> => {
      const { accountId: sourceAccountId } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })

      const amount = BigInt(1)
      await expect(
        accounts.adjustBalances({
          sourceAmount: amount,
          sourceAccountId,
          destinationAccountId: uuid(),
          callback: async (trx: Transaction) => {
            await trx.commit()
          }
        })
      ).rejects.toThrow(UnknownAccountError)
    })
  })

  describe('Account Tokens', (): void => {
    test('Can retrieve account by incoming token', async (): Promise<void> => {
      const incomingToken = uuid()
      const { accountId } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100),
        http: {
          incoming: {
            authTokens: [incomingToken, uuid()]
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

  describe('ILP Address', (): void => {
    test('Can retrieve account by ILP address', async (): Promise<void> => {
      const ilpAddress = 'test.rafiki'
      const { accountId } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100),
        routing: {
          staticIlpAddress: ilpAddress
        }
      })
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress
        )
        expect(account).not.toBeNull()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account).not.toBeNull()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + 'suffix'
        )
        expect(account).toBeNull()
      }
    })

    test('Can retrieve account by configured peer ILP address', async (): Promise<void> => {
      const { ilpAddress, accountId } = config.peerAddresses[0]
      await accounts.createAccount({
        accountId,
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress
        )
        expect(account).not.toBeNull()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account).not.toBeNull()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + 'suffix'
        )
        expect(account).toBeNull()
      }
    })

    test('Can retrieve account by server ILP address', async (): Promise<void> => {
      const { accountId } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })
      const ilpAddress = config.ilpAddress + '.' + accountId
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress
        )
        expect(account).not.toBeNull()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account).not.toBeNull()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + 'suffix'
        )
        expect(account).toBeNull()
      }
    })

    test('Returns null if no account exists with address', async (): Promise<void> => {
      await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100),
        routing: {
          staticIlpAddress: 'test.rafiki'
        }
      })
      const account = await accounts.getAccountByDestinationAddress('test.nope')
      expect(account).toBeNull()
    })
  })
})
