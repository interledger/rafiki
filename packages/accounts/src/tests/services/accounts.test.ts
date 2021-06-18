import { Transaction } from 'knex'
import { Model } from 'objection'
import { Account as Balance } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { Config } from '../../config'
import { IlpAccount as IlpAccountModel } from '../../models'
import {
  randomId,
  toLiquidityId,
  toSettlementId
  // toSettlementCreditId,
  // toSettlementLoanId,
} from '../../utils'
import { createTestApp, TestContainer } from '../helpers/app'
import { randomAsset } from '../helpers/asset'
import { AccountFactory } from '../factories'
import {
  AccountsService,
  AppServices,
  DepositError,
  initIocContainer,
  // InvalidAssetError,
  isUpdateAccountError,
  UpdateAccountError,
  UpdateIlpAccountOptions,
  WithdrawError
} from '../..'
import { IocContract } from '@adonisjs/fold'

import {
  CreateAccountError,
  CreateOptions,
  IlpAccount,
  IlpBalance,
  isCreateAccountError,
  isTransferError,
  TransferError
} from '../../../../connector/src/services/core/services/accounts'

describe('Accounts Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accounts: AccountsService
  let accountFactory: AccountFactory
  let config: typeof Config
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      accounts = appContainer.app.getAccounts()
      config = appContainer.app.getConfig()
      accountFactory = new AccountFactory(accounts)
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
        asset: randomAsset()
      }
      const accountOrError = await accounts.createAccount(account)
      expect(isCreateAccountError(accountOrError)).toEqual(false)
      const expectedAccount = {
        ...account,
        disabled: false,
        stream: {
          enabled: false
        }
      }
      expect(accountOrError).toEqual(expectedAccount)
      const retrievedAccount = await IlpAccountModel.query().findById(accountId)
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
      const accountOrError = await accounts.createAccount(account)
      expect(isCreateAccountError(accountOrError)).toEqual(false)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      delete account.http!.incoming
      expect(accountOrError).toEqual(account)
      const retrievedAccount = await IlpAccountModel.query().findById(accountId)
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

    // test.skip('Cannot create an account with non-existent parent', async (): Promise<void> => {
    //   const parentAccountId = uuid()
    //   const asset = randomAsset()
    //   const account = {
    //     accountId: uuid(),
    //     asset,
    //     maxPacketAmount: BigInt(100),
    //     parentAccountId
    //   }

    //   await expect(accounts.createAccount(account)).rejects.toThrow(
    //     UnknownAccountError
    //   )

    //   await accounts.createAccount({
    //     accountId: parentAccountId,
    //     disabled: false,
    //     asset,
    //     maxPacketAmount: BigInt(100)
    //   })

    //   await accounts.createAccount(account)
    // })

    // test.skip('Cannot create an account with different asset than parent', async (): Promise<void> => {
    //   const { accountId: parentAccountId } = await accounts.createAccount({
    //     accountId: uuid(),
    //     asset: randomAsset(),
    //     maxPacketAmount: BigInt(100)
    //   })

    //   const asset = randomAsset()
    //   await expect(
    //     accounts.createAccount({
    //       accountId: uuid(),
    //       disabled: false,
    //       asset,
    //       maxPacketAmount: BigInt(100),
    //       parentAccountId
    //     })
    //   ).rejects.toThrowError(new InvalidAssetError(asset.code, asset.scale))
    // })

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
    //     } = await IlpAccountModel.query()
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
    //     } = await IlpAccountModel.query()
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

    test('Cannot create an account with duplicate id', async (): Promise<void> => {
      const account = await accountFactory.build()
      await expect(
        accounts.createAccount({
          accountId: account.accountId,
          asset: randomAsset()
        })
      ).resolves.toEqual(CreateAccountError.DuplicateAccountId)
      const retrievedAccount = await accounts.getAccount(account.accountId)
      expect(retrievedAccount).toEqual(account)
    })

    test('Cannot create an account with duplicate incoming tokens', async (): Promise<void> => {
      const accountId = uuid()
      const incomingToken = uuid()
      const account = {
        accountId,
        asset: randomAsset(),
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

      await expect(accounts.createAccount(account)).resolves.toEqual(
        CreateAccountError.DuplicateIncomingToken
      )

      const retrievedAccount = await IlpAccountModel.query().findById(accountId)
      expect(retrievedAccount).toBeUndefined()
    })

    test('Cannot create an account with duplicate incoming token', async (): Promise<void> => {
      const incomingToken = uuid()
      {
        const account = {
          accountId: uuid(),
          asset: randomAsset(),
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
        await expect(accounts.createAccount(account)).resolves.toEqual(
          CreateAccountError.DuplicateIncomingToken
        )
        const retrievedAccount = await IlpAccountModel.query().findById(
          accountId
        )
        expect(retrievedAccount).toBeUndefined()
      }
    })

    test('Auto-creates corresponding liquidity and settlement accounts', async (): Promise<void> => {
      const asset = randomAsset()
      const account = {
        accountId: uuid(),
        asset
      }

      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          toLiquidityId({
            assetCode: asset.code,
            assetScale: asset.scale,
            hmacSecret: config.hmacSecret
          }),
          toSettlementId({
            assetCode: asset.code,
            assetScale: asset.scale,
            hmacSecret: config.hmacSecret
          })
          // toSettlementCreditId(asset.code, asset.scale),
          // toSettlementLoanId(asset.code, asset.scale)
        ])
        expect(balances.length).toBe(0)
      }

      await accounts.createAccount(account)
      {
        const balances = await appContainer.tigerbeetle.lookupAccounts([
          toLiquidityId({
            assetCode: asset.code,
            assetScale: asset.scale,
            hmacSecret: config.hmacSecret
          }),
          toSettlementId({
            assetCode: asset.code,
            assetScale: asset.scale,
            hmacSecret: config.hmacSecret
          })
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
          toLiquidityId({
            assetCode: asset.code,
            assetScale: asset.scale,
            hmacSecret: config.hmacSecret
          }),
          toSettlementId({
            assetCode: asset.code,
            assetScale: asset.scale,
            hmacSecret: config.hmacSecret
          })
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
      const account = await accountFactory.build()
      const retrievedAccount = await accounts.getAccount(account.accountId)
      expect(retrievedAccount).toEqual(account)
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(accounts.getAccount(uuid())).resolves.toBeUndefined()
    })
  })

  describe('Update Account', (): void => {
    test('Can update an account', async (): Promise<void> => {
      const { accountId, asset } = await accountFactory.build({
        disabled: false,
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
      const accountOrError = await accounts.updateAccount(updateOptions)
      expect(isUpdateAccountError(accountOrError)).toEqual(false)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      delete updateOptions.http!.incoming
      const expectedAccount = {
        ...updateOptions,
        asset
      }
      expect(accountOrError as IlpAccount).toEqual(expectedAccount)
      const account = await accounts.getAccount(accountId)
      expect(account).toEqual(expectedAccount)
    })

    test('Cannot update nonexistent account', async (): Promise<void> => {
      const updateOptions: UpdateIlpAccountOptions = {
        accountId: uuid(),
        disabled: true
      }

      await expect(accounts.updateAccount(updateOptions)).resolves.toEqual(
        UpdateAccountError.UnknownAccount
      )
    })

    test('Returns error for duplicate incoming token', async (): Promise<void> => {
      const incomingToken = uuid()
      await accountFactory.build({
        http: {
          incoming: {
            authTokens: [incomingToken]
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        }
      })

      const account = await accountFactory.build()
      const updateOptions: UpdateIlpAccountOptions = {
        accountId: account.accountId,
        disabled: true,
        maxPacketAmount: BigInt(200),
        http: {
          incoming: {
            authTokens: [incomingToken]
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoing'
          }
        }
      }
      await expect(accounts.updateAccount(updateOptions)).resolves.toEqual(
        UpdateAccountError.DuplicateIncomingToken
      )
      const retrievedAccount = await accounts.getAccount(account.accountId)
      expect(retrievedAccount).toEqual(account)
    })

    test('Returns error for duplicate incoming tokens', async (): Promise<void> => {
      const incomingToken = uuid()

      const account = await accountFactory.build()
      const updateOptions: UpdateIlpAccountOptions = {
        accountId: account.accountId,
        disabled: true,
        maxPacketAmount: BigInt(200),
        http: {
          incoming: {
            authTokens: [incomingToken, incomingToken]
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoing'
          }
        }
      }
      await expect(accounts.updateAccount(updateOptions)).resolves.toEqual(
        UpdateAccountError.DuplicateIncomingToken
      )
      const retrievedAccount = await accounts.getAccount(account.accountId)
      expect(retrievedAccount).toEqual(account)
    })
  })

  describe('Get Account Balance', (): void => {
    test("Can retrieve an account's balance", async (): Promise<void> => {
      const { accountId /*, asset*/ } = await accountFactory.build()

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

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(accounts.getAccountBalance(uuid())).resolves.toBeUndefined()
    })
  })

  describe('Get Liquidity Balance', (): void => {
    test('Can retrieve liquidity account balance', async (): Promise<void> => {
      const { asset } = await accountFactory.build()

      {
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(BigInt(0))
      }

      const amount = BigInt(10)
      await accounts.depositLiquidity({
        assetCode: asset.code,
        assetScale: asset.scale,
        amount
      })

      {
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount)
      }
    })

    test('Returns undefined for nonexistent liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      await expect(
        accounts.getLiquidityBalance(asset.code, asset.scale)
      ).resolves.toBeUndefined()
    })
  })

  describe('Get Settlement Balance', (): void => {
    test('Can retrieve settlement account balance', async (): Promise<void> => {
      const { asset } = await accountFactory.build()

      {
        const balance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(BigInt(0))
      }

      const amount = BigInt(10)
      await accounts.depositLiquidity({
        assetCode: asset.code,
        assetScale: asset.scale,
        amount
      })

      {
        const balance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount)
      }
    })

    test('Returns undefined for nonexistent settlement account', async (): Promise<void> => {
      const asset = randomAsset()
      await expect(
        accounts.getSettlementBalance(asset.code, asset.scale)
      ).resolves.toBeUndefined()
    })
  })

  describe('Deposit liquidity', (): void => {
    test('Can deposit to liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      const amount = BigInt(10)
      {
        const error = await accounts.depositLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount
        })
        expect(error).toBeUndefined()
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount)
        const settlementBalance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(settlementBalance).toEqual(amount)
      }
      const amount2 = BigInt(5)
      {
        const error = await accounts.depositLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount: amount2
        })
        expect(error).toBeUndefined()
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount + amount2)
        const settlementBalance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(settlementBalance).toEqual(amount + amount2)
      }
    })

    test('Can deposit liquidity with idempotency key', async (): Promise<void> => {
      const asset = randomAsset()
      const amount = BigInt(10)
      const depositId = randomId()
      {
        const error = await accounts.depositLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount,
          depositId
        })
        expect(error).toBeUndefined()
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount)
      }
      {
        const error = await accounts.depositLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount,
          depositId
        })
        expect(error).toEqual(DepositError.DepositExists)
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount)
      }
    })
  })

  describe('Withdraw liquidity', (): void => {
    test('Can withdraw liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      const startingBalance = BigInt(10)
      await accounts.depositLiquidity({
        assetCode: asset.code,
        assetScale: asset.scale,
        amount: startingBalance
      })
      const amount = BigInt(5)
      {
        const error = await accounts.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount
        })
        expect(error).toBeUndefined()
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(startingBalance - amount)
        const settlementBalance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(settlementBalance).toEqual(startingBalance - amount)
      }
      const amount2 = BigInt(5)
      {
        const error = await accounts.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount: amount2
        })
        expect(error).toBeUndefined()
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(startingBalance - amount - amount2)
        const settlementBalance = await accounts.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(settlementBalance).toEqual(startingBalance - amount - amount2)
      }
    })

    test('Can withdraw liquidity with idempotency key', async (): Promise<void> => {
      const asset = randomAsset()
      const startingBalance = BigInt(10)
      await accounts.depositLiquidity({
        assetCode: asset.code,
        assetScale: asset.scale,
        amount: startingBalance
      })
      const amount = BigInt(5)
      const withdrawalId = randomId()
      {
        const error = await accounts.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount,
          withdrawalId
        })
        expect(error).toBeUndefined()
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(startingBalance - amount)
      }
      {
        const error = await accounts.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount,
          withdrawalId
        })
        expect(error).toEqual(WithdrawError.WithdrawalExists)
        const balance = await accounts.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(startingBalance - amount)
      }
    })

    test('Returns error for insufficient balance', async (): Promise<void> => {
      const asset = randomAsset()
      const startingBalance = BigInt(5)
      await accounts.depositLiquidity({
        assetCode: asset.code,
        assetScale: asset.scale,
        amount: startingBalance
      })
      const amount = BigInt(10)
      await expect(
        accounts.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount
        })
      ).resolves.toEqual(WithdrawError.InsufficientLiquidity)

      const balance = await accounts.getLiquidityBalance(
        asset.code,
        asset.scale
      )
      expect(balance).toEqual(startingBalance)
      const settlementBalance = await accounts.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(startingBalance)
    })

    test('Returns error for unknown liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      const amount = BigInt(10)
      await expect(
        accounts.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount
        })
      ).resolves.toEqual(WithdrawError.UnknownLiquidityAccount)
    })
  })

  describe('Account Deposit', (): void => {
    test('Can deposit to account', async (): Promise<void> => {
      const { accountId, asset } = await accountFactory.build()
      const amount = BigInt(10)
      const error = await accounts.deposit({
        accountId,
        amount
      })
      expect(error).toBeUndefined()
      const { balance } = (await accounts.getAccountBalance(
        accountId
      )) as IlpBalance
      expect(balance).toEqual(amount)
      const settlementBalance = await accounts.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(amount)

      {
        const error = await accounts.deposit({
          accountId,
          amount
        })
        expect(error).toBeUndefined()
        const { balance } = (await accounts.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(amount + amount)
      }
    })

    test("Can't deposit to nonexistent account", async (): Promise<void> => {
      const accountId = uuid()
      const error = await accounts.deposit({
        accountId,
        amount: BigInt(5)
      })
      expect(error).toEqual(DepositError.UnknownAccount)
    })

    test('Can deposit with idempotency key', async (): Promise<void> => {
      const { accountId } = await accountFactory.build()
      const amount = BigInt(10)
      const depositId = randomId()
      {
        const error = await accounts.deposit({
          accountId,
          amount,
          depositId
        })
        expect(error).toBeUndefined()
        const { balance } = (await accounts.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(amount)
      }
      {
        const error = await accounts.deposit({
          accountId,
          amount,
          depositId
        })
        expect(error).toEqual(DepositError.DepositExists)
        const { balance } = (await accounts.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(amount)
      }
    })
  })

  describe('Account Withdraw', (): void => {
    test('Can withdraw from account', async (): Promise<void> => {
      const { accountId, asset } = await accountFactory.build()
      const startingBalance = BigInt(10)
      await accounts.deposit({
        accountId,
        amount: startingBalance
      })
      const amount = BigInt(5)
      const error = await accounts.withdraw({
        accountId,
        amount
      })
      expect(error).toBeUndefined()
      const { balance } = (await accounts.getAccountBalance(
        accountId
      )) as IlpBalance
      expect(balance).toEqual(startingBalance - amount)
      const settlementBalance = await accounts.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(startingBalance - amount)
      {
        const error = await accounts.withdraw({
          accountId,
          amount
        })
        expect(error).toBeUndefined()
        const { balance } = (await accounts.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(startingBalance - amount - amount)
      }
    })

    test("Can't withdraw from nonexistent account", async (): Promise<void> => {
      const accountId = uuid()
      await expect(
        accounts.withdraw({
          accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(WithdrawError.UnknownAccount)
    })

    test('Returns error for insufficient balance', async (): Promise<void> => {
      const { accountId, asset } = await accountFactory.build()
      const startingBalance = BigInt(5)
      await accounts.deposit({
        accountId,
        amount: startingBalance
      })
      const amount = BigInt(10)
      await expect(
        accounts.withdraw({
          accountId,
          amount
        })
      ).resolves.toEqual(WithdrawError.InsufficientBalance)
      const { balance } = (await accounts.getAccountBalance(
        accountId
      )) as IlpBalance
      expect(balance).toEqual(startingBalance)
      const settlementBalance = await accounts.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(startingBalance)
    })

    test('Can withdraw with idempotency key', async (): Promise<void> => {
      const { accountId } = await accountFactory.build()
      const startingBalance = BigInt(10)
      await accounts.deposit({
        accountId,
        amount: startingBalance
      })
      const amount = BigInt(5)
      const withdrawalId = randomId()
      {
        const error = await accounts.withdraw({
          accountId,
          amount,
          withdrawalId
        })
        expect(error).toBeUndefined()
        const { balance } = (await accounts.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(startingBalance - amount)
      }
      {
        const error = await accounts.withdraw({
          accountId,
          amount,
          withdrawalId
        })
        expect(error).toEqual(WithdrawError.WithdrawalExists)
        const { balance } = (await accounts.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(startingBalance - amount)
      }
    })
  })

  describe('Account Tokens', (): void => {
    test('Can retrieve account by incoming token', async (): Promise<void> => {
      const incomingToken = uuid()
      const { accountId } = await accountFactory.build({
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
      expect(account).not.toBeUndefined()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(account!.accountId).toEqual(accountId)
    })

    test('Returns undefined if no account exists with token', async (): Promise<void> => {
      const account = await accounts.getAccountByToken(uuid())
      expect(account).toBeUndefined()
    })
  })

  describe('Get Account By ILP Address', (): void => {
    test('Can retrieve account by ILP address', async (): Promise<void> => {
      const ilpAddress = 'test.rafiki'
      const { accountId } = await accountFactory.build({
        routing: {
          staticIlpAddress: ilpAddress
        }
      })
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress
        )
        expect(account).not.toBeUndefined()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account).not.toBeUndefined()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + 'suffix'
        )
        expect(account).toBeUndefined()
      }
    })

    test('Can retrieve account by configured peer ILP address', async (): Promise<void> => {
      const { ilpAddress, accountId } = config.peerAddresses[0]
      await accountFactory.build({
        accountId
      })
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress
        )
        expect(account).not.toBeUndefined()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account).not.toBeUndefined()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + 'suffix'
        )
        expect(account).toBeUndefined()
      }
    })

    test('Can retrieve account by server ILP address', async (): Promise<void> => {
      const { accountId } = await accountFactory.build()
      const ilpAddress = config.ilpAddress + '.' + accountId
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress
        )
        expect(account).not.toBeUndefined()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account).not.toBeUndefined()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(account!.accountId).toEqual(accountId)
      }
      {
        const account = await accounts.getAccountByDestinationAddress(
          ilpAddress + 'suffix'
        )
        expect(account).toBeUndefined()
      }
    })

    test('Returns undefined if no account exists with address', async (): Promise<void> => {
      await accountFactory.build({
        routing: {
          staticIlpAddress: 'test.rafiki'
        }
      })
      const account = await accounts.getAccountByDestinationAddress('test.nope')
      expect(account).toBeUndefined()
    })
  })

  describe('Get Account Address', (): void => {
    test("Can get account's ILP address", async (): Promise<void> => {
      const ilpAddress = 'test.rafiki'
      const { accountId } = await accountFactory.build({
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
      await accountFactory.build({ accountId })
      {
        const peerAddress = await accounts.getAddress(accountId)
        expect(peerAddress).toEqual(ilpAddress)
      }
    })

    test("Can get account's address by server ILP address", async (): Promise<void> => {
      const { accountId } = await accountFactory.build()
      {
        const ilpAddress = await accounts.getAddress(accountId)
        expect(ilpAddress).toEqual(config.ilpAddress + '.' + accountId)
      }
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(accounts.getAddress(uuid())).resolves.toBeUndefined()
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
        } = await accountFactory.build()
        const {
          accountId: destinationAccountId,
          asset: destinationAsset
        } = await accountFactory.build({
          asset: crossCurrency ? randomAsset() : sourceAsset
        })
        const startingSourceBalance = BigInt(10)
        await accounts.deposit({
          accountId: sourceAccountId,
          amount: startingSourceBalance
        })

        const startingDestinationLiquidity = crossCurrency
          ? BigInt(100)
          : BigInt(0)
        if (crossCurrency) {
          await accounts.depositLiquidity({
            assetCode: destinationAsset.code,
            assetScale: destinationAsset.scale,
            amount: startingDestinationLiquidity
          })
        }

        const sourceAmount = BigInt(1)
        const destinationAmount = crossCurrency ? BigInt(2) : undefined
        const trxOrError = await accounts.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount,
          destinationAmount
        })
        expect(isTransferError(trxOrError)).toEqual(false)
        if (isTransferError(trxOrError)) {
          fail()
        }

        {
          const { balance: sourceBalance } = (await accounts.getAccountBalance(
            sourceAccountId
          )) as IlpBalance
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
          } = (await accounts.getAccountBalance(
            destinationAccountId
          )) as IlpBalance
          expect(destinationBalance).toEqual(BigInt(0))
        }

        if (accept) {
          const error = await trxOrError.commit()
          expect(error).toBeUndefined()
          await expect(trxOrError.commit()).resolves.toEqual(
            TransferError.TransferAlreadyCommitted
          )
          await expect(trxOrError.rollback()).resolves.toEqual(
            TransferError.TransferAlreadyCommitted
          )
        } else {
          const error = await trxOrError.rollback()
          expect(error).toBeUndefined()
          await expect(trxOrError.commit()).resolves.toEqual(
            TransferError.TransferAlreadyRejected
          )
          await expect(trxOrError.rollback()).resolves.toEqual(
            TransferError.TransferAlreadyRejected
          )
        }

        {
          const { balance: sourceBalance } = (await accounts.getAccountBalance(
            sourceAccountId
          )) as IlpBalance
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
          } = (await accounts.getAccountBalance(
            destinationAccountId
          )) as IlpBalance
          const expectedDestinationBalance = accept
            ? crossCurrency
              ? destinationAmount
              : sourceAmount
            : BigInt(0)
          expect(destinationBalance).toEqual(expectedDestinationBalance)
        }
      }
    )

    test('Returns error for insufficient source balance', async (): Promise<void> => {
      const { accountId: sourceAccountId, asset } = await accountFactory.build()
      const { accountId: destinationAccountId } = await accountFactory.build({
        asset
      })
      const transfer = {
        sourceAccountId,
        destinationAccountId,
        sourceAmount: BigInt(5)
      }
      await expect(accounts.transferFunds(transfer)).resolves.toEqual(
        TransferError.InsufficientBalance
      )
      const { balance: sourceBalance } = (await accounts.getAccountBalance(
        sourceAccountId
      )) as IlpBalance
      expect(sourceBalance).toEqual(BigInt(0))
      const { balance: destinationBalance } = (await accounts.getAccountBalance(
        destinationAccountId
      )) as IlpBalance
      expect(destinationBalance).toEqual(BigInt(0))
    })

    test('Returns error for insufficient destination liquidity balance', async (): Promise<void> => {
      const {
        accountId: sourceAccountId,
        asset: sourceAsset
      } = await accountFactory.build()
      const {
        accountId: destinationAccountId,
        asset: destinationAsset
      } = await accountFactory.build()
      const startingSourceBalance = BigInt(10)
      await accounts.deposit({
        accountId: sourceAccountId,
        amount: startingSourceBalance
      })
      {
        const { balance: sourceBalance } = (await accounts.getAccountBalance(
          sourceAccountId
        )) as IlpBalance
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
        } = (await accounts.getAccountBalance(
          destinationAccountId
        )) as IlpBalance
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

      await expect(accounts.transferFunds(transfer)).resolves.toEqual(
        TransferError.InsufficientLiquidity
      )

      const { balance: sourceBalance } = (await accounts.getAccountBalance(
        sourceAccountId
      )) as IlpBalance
      expect(sourceBalance).toEqual(startingSourceBalance)
      const sourceLiquidityBalance = await accounts.getLiquidityBalance(
        sourceAsset.code,
        sourceAsset.scale
      )
      expect(sourceLiquidityBalance).toEqual(BigInt(0))
      const { balance: destinationBalance } = (await accounts.getAccountBalance(
        destinationAccountId
      )) as IlpBalance
      expect(destinationBalance).toEqual(BigInt(0))
      const destinationLiquidityBalance = await accounts.getLiquidityBalance(
        destinationAsset.code,
        destinationAsset.scale
      )
      expect(destinationLiquidityBalance).toEqual(BigInt(0))
    })

    test('Returns error for nonexistent account', async (): Promise<void> => {
      await expect(
        accounts.transferFunds({
          sourceAccountId: uuid(),
          destinationAccountId: uuid(),
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.UnknownSourceAccount)

      const { accountId } = await accountFactory.build()

      const unknownAccountId = uuid()
      await expect(
        accounts.transferFunds({
          sourceAccountId: accountId,
          destinationAccountId: unknownAccountId,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.UnknownDestinationAccount)

      await expect(
        accounts.transferFunds({
          sourceAccountId: unknownAccountId,
          destinationAccountId: accountId,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.UnknownSourceAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { accountId } = await accountFactory.build()

      await expect(
        accounts.transferFunds({
          sourceAccountId: accountId,
          destinationAccountId: accountId,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.SameAccounts)
    })

    test('Returns error for invalid source amount', async (): Promise<void> => {
      const { accountId: sourceAccountId, asset } = await accountFactory.build()
      const { accountId: destinationAccountId } = await accountFactory.build({
        asset
      })
      const startingSourceBalance = BigInt(10)
      await accounts.deposit({
        accountId: sourceAccountId,
        amount: startingSourceBalance
      })

      await expect(
        accounts.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(0)
        })
      ).resolves.toEqual(TransferError.InvalidSourceAmount)

      await expect(
        accounts.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(-1)
        })
      ).resolves.toEqual(TransferError.InvalidSourceAmount)
    })

    test('Returns error for invalid destination amount', async (): Promise<void> => {
      const { accountId: sourceAccountId, asset } = await accountFactory.build()
      const { accountId: destinationAccountId } = await accountFactory.build({
        asset
      })
      const startingSourceBalance = BigInt(10)
      await accounts.deposit({
        accountId: sourceAccountId,
        amount: startingSourceBalance
      })

      await expect(
        accounts.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(10)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)

      await expect(
        accounts.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(0)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)

      await expect(
        accounts.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(-1)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)
    })

    test('Returns error for missing destination amount', async (): Promise<void> => {
      const { accountId: sourceAccountId } = await accountFactory.build()
      const { accountId: destinationAccountId } = await accountFactory.build()
      const startingSourceBalance = BigInt(10)
      await accounts.deposit({
        accountId: sourceAccountId,
        amount: startingSourceBalance
      })

      await expect(
        accounts.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)
    })

    test.todo('Returns error timed out transfer')
  })
})
