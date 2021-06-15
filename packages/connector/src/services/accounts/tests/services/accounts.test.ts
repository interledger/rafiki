import { randomInt } from 'crypto'

import { Transaction } from 'knex'
import { Model, UniqueViolationError } from 'objection'
import { Account as Balance } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import {
  toLiquidityId,
  toSettlementId
  // toSettlementCreditId,
  // toSettlementLoanId,
} from '../../utils'
import { createTestApp, TestContainer } from '../helpers/app'
import {
  Account,
  AccountsService,
  AppServices,
  Config,
  InsufficientBalanceError,
  InsufficientLiquidityError,
  InvalidAssetError,
  InvalidTransferError,
  UnknownAccountError,
  UnknownLiquidityAccountError,
  UnknownSettlementAccountError,
  UpdateIlpAccountOptions
} from '../..'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../../../accounts'

import { CreateOptions } from '../../../core/services/accounts'

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
  let trx: Transaction

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
        retrievedAccount.balanceId
        // uuidToBigInt(retrievedAccount.debtBalanceId),
        // uuidToBigInt(retrievedAccount.trustlineBalanceId)
      ])
      // expect(balances.length).toBe(3)
      expect(balances.length).toBe(1)
      balances.forEach((balance: Balance) => {
        expect(balance.credits_reserved).toEqual(BigInt(0))
        expect(balance.credits_accepted).toEqual(BigInt(0))
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
        retrievedAccount.balanceId
        // uuidToBigInt(retrievedAccount.debtBalanceId),
        // uuidToBigInt(retrievedAccount.trustlineBalanceId)
      ])
      // expect(balances.length).toBe(3)
      expect(balances.length).toBe(1)
      balances.forEach((balance: Balance) => {
        expect(balance.credits_reserved).toEqual(BigInt(0))
        expect(balance.credits_accepted).toEqual(BigInt(0))
      })
    })

    test.skip('Cannot create an account with non-existent parent', async (): Promise<void> => {
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

    test.skip('Cannot create an account with different asset than parent', async (): Promise<void> => {
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

    // test("Auto-creates parent account's credit and loan balances", async (): Promise<void> => {
    //   const {
    //     accountId: parentAccountId,
    //     asset
    //   } = await accounts.createAccount({
    //     accountId: uuid(),
    //     asset: randomAsset(),
    //     maxPacketAmount: BigInt(100)
    //   })

    //   {
    //     const {
    //       creditBalanceId,
    //       loanBalanceId
    //     } = await Account.query()
    //       .findById(parentAccountId)
    //       .select('creditBalanceId', 'loanBalanceId')
    //     expect(creditBalanceId).toBeNull()
    //     expect(loanBalanceId).toBeNull()
    //   }

    //   await accounts.createAccount({
    //     accountId: uuid(),
    //     asset,
    //     maxPacketAmount: BigInt(100),
    //     parentAccountId
    //   })

    //   {
    //     const {
    //       creditBalanceId,
    //       loanBalanceId
    //     } = await Account.query()
    //       .findById(parentAccountId)
    //       .select('creditBalanceId', 'loanBalanceId')
    //     expect(creditBalanceId).not.toBeNull()
    //     expect(loanBalanceId).not.toBeNull()

    //     if (creditBalanceId && loanBalanceId) {
    //       const balances = await appContainer.tigerbeetle.lookupAccounts([
    //         uuidToBigInt(creditBalanceId),
    //         uuidToBigInt(loanBalanceId)
    //       ])
    //       expect(balances.length).toBe(2)
    //       balances.forEach((balance: Balance) => {
    //         expect(balance.credits_reserved).toEqual(BigInt(0))
    //         expect(balance.credits_accepted).toEqual(BigInt(0))
    //       })
    //     } else {
    //       fail()
    //     }
    //   }
    // })

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
          toSettlementId(asset.code, asset.scale)
          // toSettlementCreditId(asset.code, asset.scale),
          // toSettlementLoanId(asset.code, asset.scale)
        ])
        expect(balances.length).toBe(0)
      }

      await accounts.createAccount(account)
      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          toLiquidityId(asset.code, asset.scale),
          toSettlementId(asset.code, asset.scale)
          // toSettlementCreditId(asset.code, asset.scale),
          // toSettlementLoanId(asset.code, asset.scale)
        ])
        // expect(balances.length).toBe(4)
        expect(balances.length).toBe(2)
        balances.forEach((balance: Balance) => {
          expect(balance.credits_reserved).toEqual(BigInt(0))
          expect(balance.credits_accepted).toEqual(BigInt(0))
        })
      }

      await accounts.createAccount({
        ...account,
        accountId: uuid()
      })

      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          toLiquidityId(asset.code, asset.scale),
          toSettlementId(asset.code, asset.scale)
          // toSettlementCreditId(asset.code, asset.scale),
          // toSettlementLoanId(asset.code, asset.scale)
        ])
        // expect(balances.length).toBe(4)
        expect(balances.length).toBe(2)
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
      const { accountId /*, asset*/ } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })

      {
        const balance = await accounts.getAccountBalance(accountId)
        expect(balance).toEqual({
          id: accountId,
          balance: BigInt(0)
          // parent: {
          //   availableCreditLine: BigInt(0),
          //   totalBorrowed: BigInt(0)
          // }
        })
      }

      // await accounts.createAccount({
      //   accountId: uuid(),
      //   asset,
      //   maxPacketAmount: BigInt(100),
      //   parentAccountId: accountId
      // })

      // {
      //   const balance = await accounts.getAccountBalance(accountId)
      //   expect(balance).toEqual({
      //     id: accountId,
      //     balance: BigInt(0),
      //     children: {
      //       availableCredit: BigInt(0),
      //       totalLent: BigInt(0)
      //     },
      //     parent: {
      //       availableCreditLine: BigInt(0),
      //       totalBorrowed: BigInt(0)
      //     }
      //   })
      // }
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
      ).rejects.toThrowError(
        new UnknownLiquidityAccountError(asset.code, asset.scale)
      )
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
      ).rejects.toThrowError(
        new UnknownSettlementAccountError(asset.code, asset.scale)
      )
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

    test('Throws for insufficient balance', async (): Promise<void> => {
      const asset = randomAsset()
      const startingBalance = BigInt(5)
      await accounts.depositLiquidity(asset.code, asset.scale, startingBalance)
      const amount = BigInt(10)
      await expect(
        accounts.withdrawLiquidity(asset.code, asset.scale, amount)
      ).rejects.toThrowError(
        new InsufficientLiquidityError(asset.code, asset.scale)
      )
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

    test('Throws for insufficient balance', async (): Promise<void> => {
      const { accountId, asset } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })
      const startingBalance = BigInt(5)
      await accounts.deposit(accountId, startingBalance)
      const amount = BigInt(10)
      await expect(accounts.withdraw(accountId, amount)).rejects.toThrowError(
        new InsufficientBalanceError(accountId)
      )
      const { balance } = await accounts.getAccountBalance(accountId)
      expect(balance).toEqual(startingBalance)
      const settlementBalance = await accounts.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(-startingBalance)
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

  describe('Get Account By ILP Address', (): void => {
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

  describe('Get Account Address', (): void => {
    test("Can get account's ILP address", async (): Promise<void> => {
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
        const staticIlpAddress = await accounts.getAddress(accountId)
        expect(staticIlpAddress).toEqual(ilpAddress)
      }
    })

    test("Can get account's configured peer ILP address", async (): Promise<void> => {
      const { ilpAddress, accountId } = config.peerAddresses[0]
      await accounts.createAccount({
        accountId,
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })
      {
        const peerAddress = await accounts.getAddress(accountId)
        expect(peerAddress).toEqual(ilpAddress)
      }
    })

    test("Can get account's address by server ILP address", async (): Promise<void> => {
      const { accountId } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })
      {
        const ilpAddress = await accounts.getAddress(accountId)
        expect(ilpAddress).toEqual(config.ilpAddress + '.' + accountId)
      }
    })

    test('Throws for nonexistent account', async (): Promise<void> => {
      await expect(accounts.getAddress(uuid())).rejects.toThrow(
        UnknownAccountError
      )
    })
  })

  describe('Transfer Funds', (): void => {
    test.each`
      crossCurrency | accept
      ${true}       | ${true}
      ${true}       | ${false}
      ${false}      | ${true}
      ${false}      | ${false}
    `(
      'Can transfer funds with two-phase commit { cross-currency: $crossCurrency, accepted: $accept }',
      async ({ crossCurrency, accept }): Promise<void> => {
        const {
          accountId: sourceAccountId,
          asset: sourceAsset
        } = await accounts.createAccount({
          accountId: uuid(),
          asset: randomAsset(),
          maxPacketAmount: BigInt(100)
        })
        const {
          accountId: destinationAccountId,
          asset: destinationAsset
        } = await accounts.createAccount({
          accountId: uuid(),
          asset: crossCurrency ? randomAsset() : sourceAsset,
          maxPacketAmount: BigInt(100)
        })
        const startingSourceBalance = BigInt(10)
        await accounts.deposit(sourceAccountId, startingSourceBalance)

        const startingDestinationLiquidity = crossCurrency
          ? BigInt(100)
          : BigInt(0)
        if (crossCurrency) {
          await accounts.depositLiquidity(
            destinationAsset.code,
            destinationAsset.scale,
            startingDestinationLiquidity
          )
        }

        const sourceAmount = BigInt(1)
        const destinationAmount = crossCurrency ? BigInt(2) : undefined
        const trx = await accounts.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount,
          destinationAmount
        })

        {
          const { balance: sourceBalance } = await accounts.getAccountBalance(
            sourceAccountId
          )
          expect(sourceBalance).toEqual(startingSourceBalance - sourceAmount)

          const sourceLiquidityBalance = await accounts.getLiquidityBalance(
            sourceAsset.code,
            sourceAsset.scale
          )
          expect(sourceLiquidityBalance).toEqual(BigInt(0))

          const destinationLiquidityBalance = await accounts.getLiquidityBalance(
            destinationAsset.code,
            destinationAsset.scale
          )
          expect(destinationLiquidityBalance).toEqual(
            crossCurrency
              ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                startingDestinationLiquidity - destinationAmount!
              : startingDestinationLiquidity
          )

          const {
            balance: destinationBalance
          } = await accounts.getAccountBalance(destinationAccountId)
          expect(destinationBalance).toEqual(BigInt(0))
        }

        if (accept) {
          await trx.commit()
        } else {
          await trx.rollback()
        }

        {
          const { balance: sourceBalance } = await accounts.getAccountBalance(
            sourceAccountId
          )
          const expectedSourceBalance = accept
            ? startingSourceBalance - sourceAmount
            : startingSourceBalance
          expect(sourceBalance).toEqual(expectedSourceBalance)

          const sourceLiquidityBalance = await accounts.getLiquidityBalance(
            sourceAsset.code,
            sourceAsset.scale
          )
          expect(sourceLiquidityBalance).toEqual(
            crossCurrency && accept ? sourceAmount : BigInt(0)
          )

          const destinationLiquidityBalance = await accounts.getLiquidityBalance(
            destinationAsset.code,
            destinationAsset.scale
          )
          expect(destinationLiquidityBalance).toEqual(
            crossCurrency && accept
              ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                startingDestinationLiquidity - destinationAmount!
              : startingDestinationLiquidity
          )

          const {
            balance: destinationBalance
          } = await accounts.getAccountBalance(destinationAccountId)
          const expectedDestinationBalance = accept
            ? crossCurrency
              ? destinationAmount
              : sourceAmount
            : BigInt(0)
          expect(destinationBalance).toEqual(expectedDestinationBalance)
        }
      }
    )

    test('Throws for insufficient source balance', async (): Promise<void> => {
      const {
        accountId: sourceAccountId,
        asset
      } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })
      const { accountId: destinationAccountId } = await accounts.createAccount({
        accountId: uuid(),
        asset,
        maxPacketAmount: BigInt(100)
      })
      const transfer = {
        sourceAccountId,
        destinationAccountId,
        sourceAmount: BigInt(5)
      }
      await expect(accounts.transferFunds(transfer)).rejects.toThrowError(
        new InsufficientBalanceError(sourceAccountId)
      )
      const { balance: sourceBalance } = await accounts.getAccountBalance(
        sourceAccountId
      )
      expect(sourceBalance).toEqual(BigInt(0))
      const { balance: destinationBalance } = await accounts.getAccountBalance(
        destinationAccountId
      )
      expect(destinationBalance).toEqual(BigInt(0))
    })

    test('Throws for insufficient destination liquidity balance', async (): Promise<void> => {
      const {
        accountId: sourceAccountId,
        asset: sourceAsset
      } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })
      const {
        accountId: destinationAccountId,
        asset: destinationAsset
      } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })
      const startingSourceBalance = BigInt(10)
      await accounts.deposit(sourceAccountId, startingSourceBalance)
      {
        const { balance: sourceBalance } = await accounts.getAccountBalance(
          sourceAccountId
        )
        expect(sourceBalance).toEqual(startingSourceBalance)

        const sourceLiquidityBalance = await accounts.getLiquidityBalance(
          sourceAsset.code,
          sourceAsset.scale
        )
        expect(sourceLiquidityBalance).toEqual(BigInt(0))

        const destinationLiquidityBalance = await accounts.getLiquidityBalance(
          destinationAsset.code,
          destinationAsset.scale
        )
        expect(destinationLiquidityBalance).toEqual(BigInt(0))

        const {
          balance: destinationBalance
        } = await accounts.getAccountBalance(destinationAccountId)
        expect(destinationBalance).toEqual(BigInt(0))
      }
      const sourceAmount = BigInt(5)
      const destinationAmount = BigInt(10)
      const transfer = {
        sourceAccountId,
        destinationAccountId,
        sourceAmount,
        destinationAmount
      }

      await expect(accounts.transferFunds(transfer)).rejects.toThrowError(
        new InsufficientLiquidityError(
          destinationAsset.code,
          destinationAsset.scale
        )
      )

      const { balance: sourceBalance } = await accounts.getAccountBalance(
        sourceAccountId
      )
      expect(sourceBalance).toEqual(startingSourceBalance)
      const sourceLiquidityBalance = await accounts.getLiquidityBalance(
        sourceAsset.code,
        sourceAsset.scale
      )
      expect(sourceLiquidityBalance).toEqual(BigInt(0))
      const { balance: destinationBalance } = await accounts.getAccountBalance(
        destinationAccountId
      )
      expect(destinationBalance).toEqual(BigInt(0))
      const destinationLiquidityBalance = await accounts.getLiquidityBalance(
        destinationAsset.code,
        destinationAsset.scale
      )
      expect(destinationLiquidityBalance).toEqual(BigInt(0))
    })

    test('Throws for nonexistent account', async (): Promise<void> => {
      await expect(
        accounts.transferFunds({
          sourceAccountId: uuid(),
          destinationAccountId: uuid(),
          sourceAmount: BigInt(5)
        })
      ).rejects.toThrow(UnknownAccountError)

      const { accountId } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })

      const unknownAccountId = uuid()
      await expect(
        accounts.transferFunds({
          sourceAccountId: accountId,
          destinationAccountId: unknownAccountId,
          sourceAmount: BigInt(5)
        })
      ).rejects.toThrowError(new UnknownAccountError(unknownAccountId))

      await expect(
        accounts.transferFunds({
          sourceAccountId: unknownAccountId,
          destinationAccountId: accountId,
          sourceAmount: BigInt(5)
        })
      ).rejects.toThrowError(new UnknownAccountError(unknownAccountId))
    })

    test('Throws for invalid amount', async (): Promise<void> => {
      const {
        accountId: sourceAccountId,
        asset
      } = await accounts.createAccount({
        accountId: uuid(),
        asset: randomAsset(),
        maxPacketAmount: BigInt(100)
      })
      const { accountId: destinationAccountId } = await accounts.createAccount({
        accountId: uuid(),
        asset,
        maxPacketAmount: BigInt(100)
      })
      const startingSourceBalance = BigInt(10)
      await accounts.deposit(sourceAccountId, startingSourceBalance)

      await expect(
        accounts.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(10)
        })
      ).rejects.toThrow(InvalidTransferError)
    })
  })
})
