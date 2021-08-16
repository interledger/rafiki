import { Model } from 'objection'
import Knex, { Transaction } from 'knex'
import { Account as Balance, createClient, Client } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { Config } from '../config'
import { IlpAccount as IlpAccountModel } from './models'
import { randomId, toLiquidityId, toSettlementId } from './utils'
import { randomAsset, AccountFactory } from './testsHelpers'
import { AccountsService } from './service'

import {
  CreateAccountError,
  CreateOptions,
  DepositError,
  isDepositError,
  IlpAccount,
  IlpBalance,
  isCreateAccountError,
  isTransferError,
  isUpdateAccountError,
  Pagination,
  TransferError,
  CreditError,
  UpdateAccountError,
  UpdateOptions,
  WithdrawError
} from './types'
import { Logger } from '../logger/service'
import { createKnex } from '../Knex/service'

describe('Accounts Service', (): void => {
  let accountsService: AccountsService
  let accountFactory: AccountFactory
  let config: typeof Config
  let tbClient: Client
  let knex: Knex
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      config = Config
      config.ilpAddress = 'test.rafiki'
      config.peerAddresses = [
        {
          accountId: uuid(),
          ilpAddress: 'test.alice'
        }
      ]
      tbClient = createClient({
        cluster_id: config.tigerbeetleClusterId,
        replica_addresses: config.tigerbeetleReplicaAddresses
      })
      knex = await createKnex(config.postgresUrl)
      accountsService = new AccountsService(tbClient, config, Logger)
      accountFactory = new AccountFactory(accountsService)
    }
  )

  beforeEach(
    async (): Promise<void> => {
      trx = await knex.transaction()
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
      await knex.destroy()
      tbClient.destroy()
    }
  )

  describe('Create Account', (): void => {
    test('Can create an account', async (): Promise<void> => {
      const account: CreateOptions = {
        asset: randomAsset()
      }
      const accountOrError = await accountsService.createAccount(account)
      expect(isCreateAccountError(accountOrError)).toEqual(false)
      if (isCreateAccountError(accountOrError)) {
        fail()
      }
      const expectedAccount = {
        ...account,
        id: accountOrError.id,
        disabled: false,
        stream: {
          enabled: false
        }
      }
      expect(accountOrError).toEqual(expectedAccount)
      const retrievedAccount = await IlpAccountModel.query().findById(
        accountOrError.id
      )
      const balances = await tbClient.lookupAccounts([
        retrievedAccount.balanceId
      ])
      expect(balances.length).toBe(1)
      balances.forEach((balance: Balance) => {
        expect(balance.credits_reserved).toEqual(BigInt(0))
        expect(balance.credits_accepted).toEqual(BigInt(0))
      })
    })

    test('Can create an account with all settings', async (): Promise<void> => {
      const id = uuid()
      const account: CreateOptions = {
        id,
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
          staticIlpAddress: 'g.rafiki.' + id
        }
      }
      const accountOrError = await accountsService.createAccount(account)
      expect(isCreateAccountError(accountOrError)).toEqual(false)
      const expectedAccount: IlpAccount = {
        ...account,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        id: account.id!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        disabled: account.disabled!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        stream: account.stream!,
        http: {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          outgoing: account.http!.outgoing
        }
      }
      expect(accountOrError).toEqual(expectedAccount)
      const retrievedAccount = await IlpAccountModel.query().findById(id)
      const balances = await tbClient.lookupAccounts([
        retrievedAccount.balanceId
      ])
      expect(balances.length).toBe(1)
      balances.forEach((balance: Balance) => {
        expect(balance.credits_reserved).toEqual(BigInt(0))
        expect(balance.credits_accepted).toEqual(BigInt(0))
      })
    })

    test('Cannot create an account with non-existent super-account', async (): Promise<void> => {
      const superAccountId = uuid()
      const account = {
        superAccountId
      }

      await expect(accountsService.createAccount(account)).resolves.toEqual(
        CreateAccountError.UnknownSuperAccount
      )

      await accountFactory.build({
        id: superAccountId,
        asset: randomAsset()
      })

      const accountOrError = await accountsService.createAccount(account)
      expect(isCreateAccountError(accountOrError)).toEqual(false)
    })

    test('Cannot create an account with duplicate id', async (): Promise<void> => {
      const account = await accountFactory.build()
      await expect(
        accountsService.createAccount({
          id: account.id,
          asset: randomAsset()
        })
      ).resolves.toEqual(CreateAccountError.DuplicateAccountId)
      const retrievedAccount = await accountsService.getAccount(account.id)
      expect(retrievedAccount).toEqual(account)
    })

    test('Cannot create an account with duplicate incoming tokens', async (): Promise<void> => {
      const id = uuid()
      const incomingToken = uuid()
      const account = {
        id,
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

      await expect(accountsService.createAccount(account)).resolves.toEqual(
        CreateAccountError.DuplicateIncomingToken
      )

      await expect(
        IlpAccountModel.query().findById(id)
      ).resolves.toBeUndefined()
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
        await accountsService.createAccount(account)
      }
      {
        const id = uuid()
        const account = {
          id,
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
        await expect(accountsService.createAccount(account)).resolves.toEqual(
          CreateAccountError.DuplicateIncomingToken
        )
        await expect(
          IlpAccountModel.query().findById(id)
        ).resolves.toBeUndefined()
      }
    })

    test('Auto-creates corresponding liquidity and settlement accounts', async (): Promise<void> => {
      const asset = randomAsset()
      const account: CreateOptions = {
        asset
      }

      {
        const balances = await tbClient.lookupAccounts([
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
        ])
        expect(balances.length).toBe(0)
      }

      await accountsService.createAccount(account)
      {
        const balances = await tbClient.lookupAccounts([
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
        ])
        expect(balances.length).toBe(2)
        balances.forEach((balance: Balance) => {
          expect(balance.credits_reserved).toEqual(BigInt(0))
          expect(balance.credits_accepted).toEqual(BigInt(0))
        })
      }

      await accountsService.createAccount(account)

      {
        const balances = await tbClient.lookupAccounts([
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
        ])
        expect(balances.length).toBe(2)
      }
    })
  })

  describe('Get Account', (): void => {
    test('Can get an account', async (): Promise<void> => {
      const account = await accountFactory.build()
      await expect(accountsService.getAccount(account.id)).resolves.toEqual(
        account
      )
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(accountsService.getAccount(uuid())).resolves.toBeUndefined()
    })
  })

  describe('Account pagination', (): void => {
    let accountsCreated: IlpAccount[]

    beforeEach(
      async (): Promise<void> => {
        accountsCreated = []
        for (let i = 0; i < 40; i++) {
          accountsCreated.push(await accountFactory.build())
        }
      }
    )

    test('Defaults to fetching first 20 items', async (): Promise<void> => {
      const accounts = await accountsService.getAccountsPage()
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(accountsCreated[0].id)
      expect(accounts[19].id).toEqual(accountsCreated[19].id)
      expect(accounts[20]).toBeUndefined()
    })

    test('Can change forward pagination limit', async (): Promise<void> => {
      const pagination: Pagination = {
        first: 10
      }
      const accounts = await accountsService.getAccountsPage(pagination)
      expect(accounts).toHaveLength(10)
      expect(accounts[0].id).toEqual(accountsCreated[0].id)
      expect(accounts[9].id).toEqual(accountsCreated[9].id)
      expect(accounts[10]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        after: accountsCreated[19].id
      }
      const accounts = await accountsService.getAccountsPage(pagination)
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(accountsCreated[20].id)
      expect(accounts[19].id).toEqual(accountsCreated[39].id)
      expect(accounts[20]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor with a limit', async (): Promise<void> => {
      const pagination: Pagination = {
        first: 10,
        after: accountsCreated[9].id
      }
      const accounts = await accountsService.getAccountsPage(pagination)
      expect(accounts).toHaveLength(10)
      expect(accounts[0].id).toEqual(accountsCreated[10].id)
      expect(accounts[9].id).toEqual(accountsCreated[19].id)
      expect(accounts[10]).toBeUndefined()
    })

    test("Can't change backward pagination limit on it's own.", async (): Promise<void> => {
      const pagination: Pagination = {
        last: 10
      }
      const accounts = accountsService.getAccountsPage(pagination)
      await expect(accounts).rejects.toThrow(
        "Can't paginate backwards from the start."
      )
    })

    test('Can paginate backwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        before: accountsCreated[20].id
      }
      const accounts = await accountsService.getAccountsPage(pagination)
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(accountsCreated[0].id)
      expect(accounts[19].id).toEqual(accountsCreated[19].id)
      expect(accounts[20]).toBeUndefined()
    })

    test('Can paginate backwards from a cursor with a limit', async (): Promise<void> => {
      const pagination: Pagination = {
        last: 5,
        before: accountsCreated[10].id
      }
      const accounts = await accountsService.getAccountsPage(pagination)
      expect(accounts).toHaveLength(5)
      expect(accounts[0].id).toEqual(accountsCreated[5].id)
      expect(accounts[4].id).toEqual(accountsCreated[9].id)
      expect(accounts[5]).toBeUndefined()
    })

    test('Backwards/Forwards pagination results in same order.', async (): Promise<void> => {
      const paginationForwards = {
        first: 10
      }
      const accountsForwards = await accountsService.getAccountsPage(
        paginationForwards
      )
      const paginationBackwards = {
        last: 10,
        before: accountsCreated[10].id
      }
      const accountsBackwards = await accountsService.getAccountsPage(
        paginationBackwards
      )
      expect(accountsForwards).toHaveLength(10)
      expect(accountsBackwards).toHaveLength(10)
      expect(accountsForwards).toEqual(accountsBackwards)
    })

    test('Providing before and after results in forward pagination', async (): Promise<void> => {
      const pagination: Pagination = {
        after: accountsCreated[19].id,
        before: accountsCreated[19].id
      }
      const accounts = await accountsService.getAccountsPage(pagination)
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(accountsCreated[20].id)
      expect(accounts[19].id).toEqual(accountsCreated[39].id)
      expect(accounts[20]).toBeUndefined()
    })

    test("Can't request less than 0 accounts", async (): Promise<void> => {
      const pagination: Pagination = {
        first: -1
      }
      const accounts = accountsService.getAccountsPage(pagination)
      await expect(accounts).rejects.toThrow('Pagination index error')
    })

    test("Can't request more than 100 accounts", async (): Promise<void> => {
      const pagination: Pagination = {
        first: 101
      }
      const accounts = accountsService.getAccountsPage(pagination)
      await expect(accounts).rejects.toThrow('Pagination index error')
    })
  })

  describe('Get Sub-Accounts', (): void => {
    test("Can get an account's sub-accounts", async (): Promise<void> => {
      const account = await accountFactory.build()
      const expectedSubAccounts = [
        await accountFactory.build({
          superAccountId: account.id
        }),
        await accountFactory.build({
          superAccountId: account.id
        })
      ]
      const subAccounts = await accountsService.getSubAccounts(account.id)
      expect(subAccounts).toEqual(expectedSubAccounts)
    })

    test('Returns empty array for nonexistent sub-accounts', async (): Promise<void> => {
      await expect(accountsService.getSubAccounts(uuid())).resolves.toEqual([])
    })
  })

  describe('Update Account', (): void => {
    test('Can update an account', async (): Promise<void> => {
      const { id, asset } = await accountFactory.build({
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
      const updateOptions: UpdateOptions = {
        id,
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
        },
        routing: {
          staticIlpAddress: 'g.rafiki.' + id
        }
      }
      const accountOrError = await accountsService.updateAccount(updateOptions)
      expect(isUpdateAccountError(accountOrError)).toEqual(false)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      delete updateOptions.http!.incoming
      const expectedAccount: IlpAccount = {
        ...updateOptions,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        disabled: updateOptions.disabled!,
        asset,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        stream: updateOptions.stream!
      }
      expect(accountOrError as IlpAccount).toEqual(expectedAccount)
      const account = await accountsService.getAccount(id)
      expect(account).toEqual(expectedAccount)
    })

    test('Cannot update nonexistent account', async (): Promise<void> => {
      const updateOptions: UpdateOptions = {
        id: uuid(),
        disabled: true
      }

      await expect(
        accountsService.updateAccount(updateOptions)
      ).resolves.toEqual(UpdateAccountError.UnknownAccount)
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
      const updateOptions: UpdateOptions = {
        id: account.id,
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
      await expect(
        accountsService.updateAccount(updateOptions)
      ).resolves.toEqual(UpdateAccountError.DuplicateIncomingToken)
      await expect(accountsService.getAccount(account.id)).resolves.toEqual(
        account
      )
    })

    test('Returns error for duplicate incoming tokens', async (): Promise<void> => {
      const incomingToken = uuid()

      const account = await accountFactory.build()
      const updateOptions: UpdateOptions = {
        id: account.id,
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
      await expect(
        accountsService.updateAccount(updateOptions)
      ).resolves.toEqual(UpdateAccountError.DuplicateIncomingToken)
      await expect(accountsService.getAccount(account.id)).resolves.toEqual(
        account
      )
    })
  })

  describe('Get Account Balance', (): void => {
    test("Can retrieve an account's balance", async (): Promise<void> => {
      const { id } = await accountFactory.build()

      {
        const balance = await accountsService.getAccountBalance(id)
        expect(balance).toEqual({
          balance: BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: BigInt(0),
          totalBorrowed: BigInt(0),
          totalLent: BigInt(0)
        })
      }
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(
        accountsService.getAccountBalance(uuid())
      ).resolves.toBeUndefined()
    })
  })

  describe('Get Liquidity Balance', (): void => {
    test('Can retrieve liquidity account balance', async (): Promise<void> => {
      const { asset } = await accountFactory.build()

      {
        const balance = await accountsService.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(BigInt(0))
      }

      const amount = BigInt(10)
      await accountsService.depositLiquidity({
        assetCode: asset.code,
        assetScale: asset.scale,
        amount
      })

      {
        const balance = await accountsService.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount)
      }
    })

    test('Returns undefined for nonexistent liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      await expect(
        accountsService.getLiquidityBalance(asset.code, asset.scale)
      ).resolves.toBeUndefined()
    })
  })

  describe('Get Settlement Balance', (): void => {
    test('Can retrieve settlement account balance', async (): Promise<void> => {
      const { asset } = await accountFactory.build()

      {
        const balance = await accountsService.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(BigInt(0))
      }

      const amount = BigInt(10)
      await accountsService.depositLiquidity({
        assetCode: asset.code,
        assetScale: asset.scale,
        amount
      })

      {
        const balance = await accountsService.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount)
      }
    })

    test('Returns undefined for nonexistent settlement account', async (): Promise<void> => {
      const asset = randomAsset()
      await expect(
        accountsService.getSettlementBalance(asset.code, asset.scale)
      ).resolves.toBeUndefined()
    })
  })

  describe('Deposit liquidity', (): void => {
    test('Can deposit to liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      const amount = BigInt(10)
      {
        const error = await accountsService.depositLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount
        })
        expect(error).toBeUndefined()
        const balance = await accountsService.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount)
        const settlementBalance = await accountsService.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(settlementBalance).toEqual(amount)
      }
      const amount2 = BigInt(5)
      {
        const error = await accountsService.depositLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount: amount2
        })
        expect(error).toBeUndefined()
        const balance = await accountsService.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount + amount2)
        const settlementBalance = await accountsService.getSettlementBalance(
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
        const error = await accountsService.depositLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount,
          depositId
        })
        expect(error).toBeUndefined()
        const balance = await accountsService.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(amount)
      }
      {
        const error = await accountsService.depositLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount,
          depositId
        })
        expect(error).toEqual(DepositError.DepositExists)
        const balance = await accountsService.getLiquidityBalance(
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
      await accountsService.depositLiquidity({
        assetCode: asset.code,
        assetScale: asset.scale,
        amount: startingBalance
      })
      const amount = BigInt(5)
      {
        const error = await accountsService.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount
        })
        expect(error).toBeUndefined()
        const balance = await accountsService.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(startingBalance - amount)
        const settlementBalance = await accountsService.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(settlementBalance).toEqual(startingBalance - amount)
      }
      const amount2 = BigInt(5)
      {
        const error = await accountsService.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount: amount2
        })
        expect(error).toBeUndefined()
        const balance = await accountsService.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(startingBalance - amount - amount2)
        const settlementBalance = await accountsService.getSettlementBalance(
          asset.code,
          asset.scale
        )
        expect(settlementBalance).toEqual(startingBalance - amount - amount2)
      }
    })

    test('Can withdraw liquidity with idempotency key', async (): Promise<void> => {
      const asset = randomAsset()
      const startingBalance = BigInt(10)
      await accountsService.depositLiquidity({
        assetCode: asset.code,
        assetScale: asset.scale,
        amount: startingBalance
      })
      const amount = BigInt(5)
      const withdrawalId = randomId()
      {
        const error = await accountsService.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount,
          withdrawalId
        })
        expect(error).toBeUndefined()
        const balance = await accountsService.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(startingBalance - amount)
      }
      {
        const error = await accountsService.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount,
          withdrawalId
        })
        expect(error).toEqual(WithdrawError.WithdrawalExists)
        const balance = await accountsService.getLiquidityBalance(
          asset.code,
          asset.scale
        )
        expect(balance).toEqual(startingBalance - amount)
      }
    })

    test('Returns error for insufficient balance', async (): Promise<void> => {
      const asset = randomAsset()
      const startingBalance = BigInt(5)
      await accountsService.depositLiquidity({
        assetCode: asset.code,
        assetScale: asset.scale,
        amount: startingBalance
      })
      const amount = BigInt(10)
      await expect(
        accountsService.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount
        })
      ).resolves.toEqual(WithdrawError.InsufficientLiquidity)

      const balance = await accountsService.getLiquidityBalance(
        asset.code,
        asset.scale
      )
      expect(balance).toEqual(startingBalance)
      const settlementBalance = await accountsService.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(startingBalance)
    })

    test('Returns error for unknown liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      const amount = BigInt(10)
      await expect(
        accountsService.withdrawLiquidity({
          assetCode: asset.code,
          assetScale: asset.scale,
          amount
        })
      ).resolves.toEqual(WithdrawError.UnknownLiquidityAccount)
    })
  })

  describe('Account Deposit', (): void => {
    test('Can deposit to account', async (): Promise<void> => {
      const { id: accountId, asset } = await accountFactory.build()
      const amount = BigInt(10)
      const deposit = {
        accountId,
        amount
      }
      const depositOrError = await accountsService.deposit(deposit)
      expect(isDepositError(depositOrError)).toEqual(false)
      if (isDepositError(depositOrError)) {
        fail()
      }
      expect(depositOrError).toEqual({
        ...deposit,
        id: depositOrError.id
      })
      const { balance } = (await accountsService.getAccountBalance(
        accountId
      )) as IlpBalance
      expect(balance).toEqual(amount)
      const settlementBalance = await accountsService.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(amount)

      {
        const depositOrError = await accountsService.deposit(deposit)
        expect(isDepositError(depositOrError)).toEqual(false)
        if (isDepositError(depositOrError)) {
          fail()
        }
        expect(depositOrError).toEqual({
          ...deposit,
          id: depositOrError.id
        })
        const { balance } = (await accountsService.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(amount + amount)
      }
    })

    test("Can't deposit to nonexistent account", async (): Promise<void> => {
      const accountId = uuid()
      const error = await accountsService.deposit({
        accountId,
        amount: BigInt(5)
      })
      expect(isDepositError(error)).toEqual(true)
      expect(error).toEqual(DepositError.UnknownAccount)
    })

    test('Can deposit with idempotency key', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(10)
      const deposit = {
        id: uuid(),
        accountId,
        amount
      }
      {
        const depositOrError = await accountsService.deposit(deposit)
        expect(isDepositError(depositOrError)).toEqual(false)
        expect(depositOrError).toEqual(deposit)
        const { balance } = (await accountsService.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(amount)
      }
      {
        const error = await accountsService.deposit(deposit)
        expect(isDepositError(error)).toEqual(true)
        expect(error).toEqual(DepositError.DepositExists)
        const { balance } = (await accountsService.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(amount)
      }
    })
  })

  describe('Account Withdraw', (): void => {
    test('Can withdraw from account', async (): Promise<void> => {
      const { id: accountId, asset } = await accountFactory.build()
      const startingBalance = BigInt(10)
      await accountsService.deposit({
        accountId,
        amount: startingBalance
      })
      const amount = BigInt(5)
      const error = await accountsService.withdraw({
        accountId,
        amount
      })
      expect(error).toBeUndefined()
      const { balance } = (await accountsService.getAccountBalance(
        accountId
      )) as IlpBalance
      expect(balance).toEqual(startingBalance - amount)
      const settlementBalance = await accountsService.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(startingBalance - amount)
      {
        const error = await accountsService.withdraw({
          accountId,
          amount
        })
        expect(error).toBeUndefined()
        const { balance } = (await accountsService.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(startingBalance - amount - amount)
      }
    })

    test("Can't withdraw from nonexistent account", async (): Promise<void> => {
      const accountId = uuid()
      await expect(
        accountsService.withdraw({
          accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(WithdrawError.UnknownAccount)
    })

    test('Returns error for insufficient balance', async (): Promise<void> => {
      const { id: accountId, asset } = await accountFactory.build()
      const startingBalance = BigInt(5)
      await accountsService.deposit({
        accountId,
        amount: startingBalance
      })
      const amount = BigInt(10)
      await expect(
        accountsService.withdraw({
          accountId,
          amount
        })
      ).resolves.toEqual(WithdrawError.InsufficientBalance)
      const { balance } = (await accountsService.getAccountBalance(
        accountId
      )) as IlpBalance
      expect(balance).toEqual(startingBalance)
      const settlementBalance = await accountsService.getSettlementBalance(
        asset.code,
        asset.scale
      )
      expect(settlementBalance).toEqual(startingBalance)
    })

    test('Can withdraw with idempotency key', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const startingBalance = BigInt(10)
      await accountsService.deposit({
        accountId,
        amount: startingBalance
      })
      const amount = BigInt(5)
      const withdrawalId = randomId()
      {
        const error = await accountsService.withdraw({
          accountId,
          amount,
          withdrawalId
        })
        expect(error).toBeUndefined()
        const { balance } = (await accountsService.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(startingBalance - amount)
      }
      {
        const error = await accountsService.withdraw({
          accountId,
          amount,
          withdrawalId
        })
        expect(error).toEqual(WithdrawError.WithdrawalExists)
        const { balance } = (await accountsService.getAccountBalance(
          accountId
        )) as IlpBalance
        expect(balance).toEqual(startingBalance - amount)
      }
    })
  })

  describe('Account Tokens', (): void => {
    test('Can retrieve account by incoming token', async (): Promise<void> => {
      const incomingToken = uuid()
      const { id } = await accountFactory.build({
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
      const account = await accountsService.getAccountByToken(incomingToken)
      expect(account?.id).toEqual(id)
    })

    test('Returns undefined if no account exists with token', async (): Promise<void> => {
      const account = await accountsService.getAccountByToken(uuid())
      expect(account).toBeUndefined()
    })
  })

  describe('Get Account By ILP Address', (): void => {
    test('Can retrieve account by ILP address', async (): Promise<void> => {
      const ilpAddress = 'test.rafiki'
      const { id } = await accountFactory.build({
        routing: {
          staticIlpAddress: ilpAddress
        }
      })
      {
        const account = await accountsService.getAccountByDestinationAddress(
          ilpAddress
        )
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountsService.getAccountByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountsService.getAccountByDestinationAddress(
          ilpAddress + 'suffix'
        )
        expect(account).toBeUndefined()
      }
    })

    test('Can retrieve account by configured peer ILP address', async (): Promise<void> => {
      const { ilpAddress, accountId: id } = config.peerAddresses[0]
      await accountFactory.build({
        id
      })
      {
        const account = await accountsService.getAccountByDestinationAddress(
          ilpAddress
        )
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountsService.getAccountByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountsService.getAccountByDestinationAddress(
          ilpAddress + 'suffix'
        )
        expect(account).toBeUndefined()
      }
    })

    test('Can retrieve account by server ILP address', async (): Promise<void> => {
      const { id } = await accountFactory.build()
      const ilpAddress = config.ilpAddress + '.' + id
      {
        const account = await accountsService.getAccountByDestinationAddress(
          ilpAddress
        )
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountsService.getAccountByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountsService.getAccountByDestinationAddress(
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
      const account = await accountsService.getAccountByDestinationAddress(
        'test.nope'
      )
      expect(account).toBeUndefined()
    })
  })

  describe('Get Account Address', (): void => {
    test("Can get account's ILP address", async (): Promise<void> => {
      const ilpAddress = 'test.rafiki'
      const { id } = await accountFactory.build({
        routing: {
          staticIlpAddress: ilpAddress
        }
      })
      {
        const staticIlpAddress = await accountsService.getAddress(id)
        expect(staticIlpAddress).toEqual(ilpAddress)
      }
    })

    test("Can get account's configured peer ILP address", async (): Promise<void> => {
      const { ilpAddress, accountId: id } = config.peerAddresses[0]
      await accountFactory.build({ id })
      {
        const peerAddress = await accountsService.getAddress(id)
        expect(peerAddress).toEqual(ilpAddress)
      }
    })

    test("Can get account's address by server ILP address", async (): Promise<void> => {
      const { id } = await accountFactory.build()
      {
        const ilpAddress = await accountsService.getAddress(id)
        expect(ilpAddress).toEqual(config.ilpAddress + '.' + id)
      }
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(accountsService.getAddress(uuid())).resolves.toBeUndefined()
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
          id: sourceAccountId,
          asset: sourceAsset
        } = await accountFactory.build()
        const {
          id: destinationAccountId,
          asset: destinationAsset
        } = await accountFactory.build({
          asset: crossCurrency ? randomAsset() : sourceAsset
        })
        const startingSourceBalance = BigInt(10)
        await accountsService.deposit({
          accountId: sourceAccountId,
          amount: startingSourceBalance
        })

        const startingDestinationLiquidity = crossCurrency
          ? BigInt(100)
          : BigInt(0)
        if (crossCurrency) {
          await accountsService.depositLiquidity({
            assetCode: destinationAsset.code,
            assetScale: destinationAsset.scale,
            amount: startingDestinationLiquidity
          })
        }

        const sourceAmount = BigInt(1)
        const destinationAmount = crossCurrency ? BigInt(2) : undefined
        const trxOrError = await accountsService.transferFunds({
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
          const {
            balance: sourceBalance
          } = (await accountsService.getAccountBalance(
            sourceAccountId
          )) as IlpBalance
          expect(sourceBalance).toEqual(startingSourceBalance - sourceAmount)

          const sourceLiquidityBalance = await accountsService.getLiquidityBalance(
            sourceAsset.code,
            sourceAsset.scale
          )
          expect(sourceLiquidityBalance).toEqual(BigInt(0))

          const destinationLiquidityBalance = await accountsService.getLiquidityBalance(
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
          } = (await accountsService.getAccountBalance(
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
          const {
            balance: sourceBalance
          } = (await accountsService.getAccountBalance(
            sourceAccountId
          )) as IlpBalance
          const expectedSourceBalance = accept
            ? startingSourceBalance - sourceAmount
            : startingSourceBalance
          expect(sourceBalance).toEqual(expectedSourceBalance)

          const sourceLiquidityBalance = await accountsService.getLiquidityBalance(
            sourceAsset.code,
            sourceAsset.scale
          )
          expect(sourceLiquidityBalance).toEqual(
            crossCurrency && accept ? sourceAmount : BigInt(0)
          )

          const destinationLiquidityBalance = await accountsService.getLiquidityBalance(
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
          } = (await accountsService.getAccountBalance(
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
      const { id: sourceAccountId, asset } = await accountFactory.build()
      const { id: destinationAccountId } = await accountFactory.build({
        asset
      })
      const transfer = {
        sourceAccountId,
        destinationAccountId,
        sourceAmount: BigInt(5)
      }
      await expect(accountsService.transferFunds(transfer)).resolves.toEqual(
        TransferError.InsufficientBalance
      )
      const {
        balance: sourceBalance
      } = (await accountsService.getAccountBalance(
        sourceAccountId
      )) as IlpBalance
      expect(sourceBalance).toEqual(BigInt(0))
      const {
        balance: destinationBalance
      } = (await accountsService.getAccountBalance(
        destinationAccountId
      )) as IlpBalance
      expect(destinationBalance).toEqual(BigInt(0))
    })

    test('Returns error for insufficient destination liquidity balance', async (): Promise<void> => {
      const {
        id: sourceAccountId,
        asset: sourceAsset
      } = await accountFactory.build()
      const {
        id: destinationAccountId,
        asset: destinationAsset
      } = await accountFactory.build()
      const startingSourceBalance = BigInt(10)
      await accountsService.deposit({
        accountId: sourceAccountId,
        amount: startingSourceBalance
      })
      {
        const {
          balance: sourceBalance
        } = (await accountsService.getAccountBalance(
          sourceAccountId
        )) as IlpBalance
        expect(sourceBalance).toEqual(startingSourceBalance)

        const sourceLiquidityBalance = await accountsService.getLiquidityBalance(
          sourceAsset.code,
          sourceAsset.scale
        )
        expect(sourceLiquidityBalance).toEqual(BigInt(0))

        const destinationLiquidityBalance = await accountsService.getLiquidityBalance(
          destinationAsset.code,
          destinationAsset.scale
        )
        expect(destinationLiquidityBalance).toEqual(BigInt(0))

        const {
          balance: destinationBalance
        } = (await accountsService.getAccountBalance(
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

      await expect(accountsService.transferFunds(transfer)).resolves.toEqual(
        TransferError.InsufficientLiquidity
      )

      const {
        balance: sourceBalance
      } = (await accountsService.getAccountBalance(
        sourceAccountId
      )) as IlpBalance
      expect(sourceBalance).toEqual(startingSourceBalance)
      const sourceLiquidityBalance = await accountsService.getLiquidityBalance(
        sourceAsset.code,
        sourceAsset.scale
      )
      expect(sourceLiquidityBalance).toEqual(BigInt(0))
      const {
        balance: destinationBalance
      } = (await accountsService.getAccountBalance(
        destinationAccountId
      )) as IlpBalance
      expect(destinationBalance).toEqual(BigInt(0))
      const destinationLiquidityBalance = await accountsService.getLiquidityBalance(
        destinationAsset.code,
        destinationAsset.scale
      )
      expect(destinationLiquidityBalance).toEqual(BigInt(0))
    })

    test('Returns error for nonexistent account', async (): Promise<void> => {
      await expect(
        accountsService.transferFunds({
          sourceAccountId: uuid(),
          destinationAccountId: uuid(),
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.UnknownSourceAccount)

      const { id } = await accountFactory.build()

      const unknownAccountId = uuid()
      await expect(
        accountsService.transferFunds({
          sourceAccountId: id,
          destinationAccountId: unknownAccountId,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.UnknownDestinationAccount)

      await expect(
        accountsService.transferFunds({
          sourceAccountId: unknownAccountId,
          destinationAccountId: id,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.UnknownSourceAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id } = await accountFactory.build()

      await expect(
        accountsService.transferFunds({
          sourceAccountId: id,
          destinationAccountId: id,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.SameAccounts)
    })

    test('Returns error for invalid source amount', async (): Promise<void> => {
      const { id: sourceAccountId, asset } = await accountFactory.build()
      const { id: destinationAccountId } = await accountFactory.build({
        asset
      })
      const startingSourceBalance = BigInt(10)
      await accountsService.deposit({
        accountId: sourceAccountId,
        amount: startingSourceBalance
      })

      await expect(
        accountsService.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(0)
        })
      ).resolves.toEqual(TransferError.InvalidSourceAmount)

      await expect(
        accountsService.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(-1)
        })
      ).resolves.toEqual(TransferError.InvalidSourceAmount)
    })

    test('Returns error for invalid destination amount', async (): Promise<void> => {
      const { id: sourceAccountId, asset } = await accountFactory.build()
      const { id: destinationAccountId } = await accountFactory.build({
        asset
      })
      const startingSourceBalance = BigInt(10)
      await accountsService.deposit({
        accountId: sourceAccountId,
        amount: startingSourceBalance
      })

      await expect(
        accountsService.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(10)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)

      await expect(
        accountsService.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(0)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)

      await expect(
        accountsService.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(-1)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)
    })

    test('Returns error for missing destination amount', async (): Promise<void> => {
      const { id: sourceAccountId } = await accountFactory.build()
      const { id: destinationAccountId } = await accountFactory.build()
      const startingSourceBalance = BigInt(10)
      await accountsService.deposit({
        accountId: sourceAccountId,
        amount: startingSourceBalance
      })

      await expect(
        accountsService.transferFunds({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)
    })

    test.todo('Returns error timed out transfer')
  })

  describe('Extend Credit', (): void => {
    test.each`
      autoApply
      ${undefined}
      ${false}
      ${true}
    `(
      'Can extend credit to sub-account { autoApply: $autoApply }',
      async ({ autoApply }): Promise<void> => {
        const { id: superAccountId } = await accountFactory.build()
        const { id: accountId } = await accountFactory.build({
          superAccountId: superAccountId
        })
        const { id: subAccountId } = await accountFactory.build({
          superAccountId: accountId
        })

        await expect(
          accountsService.getAccountBalance(superAccountId)
        ).resolves.toEqual({
          balance: BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: BigInt(0),
          totalBorrowed: BigInt(0),
          totalLent: BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(accountId)
        ).resolves.toEqual({
          balance: BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: BigInt(0),
          totalBorrowed: BigInt(0),
          totalLent: BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(subAccountId)
        ).resolves.toEqual({
          balance: BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: BigInt(0),
          totalBorrowed: BigInt(0),
          totalLent: BigInt(0)
        })

        const depositAmount = BigInt(20)
        if (autoApply) {
          await accountsService.deposit({
            accountId: superAccountId,
            amount: depositAmount
          })
          await accountsService.deposit({
            accountId,
            amount: depositAmount
          })
        }

        const amount = BigInt(5)
        await expect(
          accountsService.extendCredit({
            accountId: superAccountId,
            subAccountId,
            amount,
            autoApply
          })
        ).resolves.toBeUndefined()

        await expect(
          accountsService.getAccountBalance(superAccountId)
        ).resolves.toEqual({
          balance: autoApply ? depositAmount - amount : BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: autoApply ? BigInt(0) : amount,
          totalBorrowed: BigInt(0),
          totalLent: autoApply ? amount : BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(accountId)
        ).resolves.toEqual({
          balance: autoApply ? depositAmount : BigInt(0),
          availableCredit: autoApply ? BigInt(0) : amount,
          creditExtended: autoApply ? BigInt(0) : amount,
          totalBorrowed: autoApply ? amount : BigInt(0),
          totalLent: autoApply ? amount : BigInt(0)
        })
        const subAccountBalance = await accountsService.getAccountBalance(
          subAccountId
        )
        expect(subAccountBalance).toEqual({
          balance: autoApply ? amount : BigInt(0),
          availableCredit: autoApply ? BigInt(0) : amount,
          creditExtended: BigInt(0),
          totalBorrowed: autoApply ? amount : BigInt(0),
          totalLent: BigInt(0)
        })

        await expect(
          accountsService.extendCredit({
            accountId: superAccountId,
            subAccountId: accountId,
            amount,
            autoApply
          })
        ).resolves.toBeUndefined()

        const superAccountBalance = await accountsService.getAccountBalance(
          superAccountId
        )
        await expect(superAccountBalance).toEqual({
          balance: autoApply ? depositAmount - amount * 2n : BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: autoApply ? BigInt(0) : amount * 2n,
          totalBorrowed: BigInt(0),
          totalLent: autoApply ? amount * 2n : BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(accountId)
        ).resolves.toEqual({
          balance: autoApply ? depositAmount + amount : BigInt(0),
          availableCredit: autoApply ? BigInt(0) : amount * 2n,
          creditExtended: autoApply ? BigInt(0) : amount,
          totalBorrowed: autoApply ? amount * 2n : BigInt(0),
          totalLent: autoApply ? amount : BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(subAccountId)
        ).resolves.toEqual(subAccountBalance)

        await expect(
          accountsService.extendCredit({
            accountId,
            subAccountId,
            amount,
            autoApply
          })
        ).resolves.toBeUndefined()

        await expect(
          accountsService.getAccountBalance(superAccountId)
        ).resolves.toEqual(superAccountBalance)
        await expect(
          accountsService.getAccountBalance(accountId)
        ).resolves.toEqual({
          balance: autoApply ? depositAmount : BigInt(0),
          availableCredit: autoApply ? BigInt(0) : amount * 2n,
          creditExtended: autoApply ? BigInt(0) : amount * 2n,
          totalBorrowed: autoApply ? amount * 2n : BigInt(0),
          totalLent: autoApply ? amount * 2n : BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(subAccountId)
        ).resolves.toEqual({
          balance: autoApply ? amount * 2n : BigInt(0),
          availableCredit: autoApply ? BigInt(0) : amount * 2n,
          creditExtended: BigInt(0),
          totalBorrowed: autoApply ? amount * 2n : BigInt(0),
          totalLent: BigInt(0)
        })
      }
    )

    test('Returns error for nonexistent account', async (): Promise<void> => {
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        accountsService.extendCredit({
          accountId: uuid(),
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownAccount)
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        accountsService.extendCredit({
          accountId,
          subAccountId: uuid(),
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownSubAccount)
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        accountsService.extendCredit({
          accountId,
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })
      await expect(
        accountsService.extendCredit({
          accountId: subAccountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        accountsService.extendCredit({
          accountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.SameAccounts)
    })

    test('Returns error for insufficient account balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      await expect(
        accountsService.extendCredit({
          accountId,
          subAccountId,
          amount: BigInt(10),
          autoApply: true
        })
      ).resolves.toEqual(CreditError.InsufficientBalance)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
    })
  })

  describe('Utilize Credit', (): void => {
    test('Can utilize credit to sub-account', async (): Promise<void> => {
      const { id: superAccountId } = await accountFactory.build()
      const { id: accountId } = await accountFactory.build({
        superAccountId: superAccountId
      })
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(10)
      await expect(
        accountsService.extendCredit({
          accountId: superAccountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()
      await accountsService.deposit({
        accountId: superAccountId,
        amount: creditAmount
      })

      await expect(
        accountsService.getAccountBalance(superAccountId)
      ).resolves.toEqual({
        balance: creditAmount,
        availableCredit: BigInt(0),
        creditExtended: creditAmount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount,
        creditExtended: creditAmount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount,
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })

      const amount = BigInt(5)
      await expect(
        accountsService.utilizeCredit({
          accountId: superAccountId,
          subAccountId,
          amount
        })
      ).resolves.toBeUndefined()

      await expect(
        accountsService.getAccountBalance(superAccountId)
      ).resolves.toEqual({
        balance: creditAmount - amount,
        availableCredit: BigInt(0),
        creditExtended: creditAmount - amount,
        totalBorrowed: BigInt(0),
        totalLent: amount
      })
      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount - amount,
        creditExtended: creditAmount - amount,
        totalBorrowed: amount,
        totalLent: amount
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
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
      await expect(
        accountsService.utilizeCredit({
          accountId: uuid(),
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownAccount)
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        accountsService.utilizeCredit({
          accountId,
          subAccountId: uuid(),
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownSubAccount)
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        accountsService.utilizeCredit({
          accountId,
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })
      await expect(
        accountsService.utilizeCredit({
          accountId: subAccountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        accountsService.utilizeCredit({
          accountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.SameAccounts)
    })

    test('Returns error for insufficient credit balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(5)
      await expect(
        accountsService.extendCredit({
          accountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()

      await expect(
        accountsService.utilizeCredit({
          accountId,
          subAccountId,
          amount: BigInt(10)
        })
      ).resolves.toEqual(CreditError.InsufficientCredit)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: creditAmount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount,
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
    })

    test('Returns error for insufficient account balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(10)
      await expect(
        accountsService.extendCredit({
          accountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()

      const accountBalance = await accountsService.getAccountBalance(accountId)
      expect(accountBalance).toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: creditAmount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      const subAccountBalance = await accountsService.getAccountBalance(
        subAccountId
      )
      expect(subAccountBalance).toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount,
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })

      await expect(
        accountsService.utilizeCredit({
          accountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toEqual(CreditError.InsufficientBalance)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual(accountBalance)
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual(subAccountBalance)
    })
  })

  describe('Revoke Credit', (): void => {
    test('Can revoke credit to sub-account', async (): Promise<void> => {
      const { id: superAccountId } = await accountFactory.build()
      const { id: accountId } = await accountFactory.build({
        superAccountId: superAccountId
      })
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(10)
      await expect(
        accountsService.extendCredit({
          accountId: superAccountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()

      const amount = BigInt(5)
      await expect(
        accountsService.revokeCredit({
          accountId: superAccountId,
          subAccountId,
          amount
        })
      ).resolves.toBeUndefined()

      await expect(
        accountsService.getAccountBalance(superAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: creditAmount - amount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount - amount,
        creditExtended: creditAmount - amount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
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
      await expect(
        accountsService.revokeCredit({
          accountId: uuid(),
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownAccount)
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        accountsService.revokeCredit({
          accountId,
          subAccountId: uuid(),
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownSubAccount)
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        accountsService.revokeCredit({
          accountId,
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })
      await expect(
        accountsService.revokeCredit({
          accountId: subAccountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        accountsService.revokeCredit({
          accountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.SameAccounts)
    })

    test('Returns error for insufficient credit balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(5)
      await expect(
        accountsService.extendCredit({
          accountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()

      await expect(
        accountsService.revokeCredit({
          accountId,
          subAccountId,
          amount: BigInt(10)
        })
      ).resolves.toEqual(CreditError.InsufficientCredit)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: creditAmount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount,
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
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
        const { id: superAccountId } = await accountFactory.build()
        const { id: accountId } = await accountFactory.build({
          superAccountId: superAccountId
        })
        const { id: subAccountId } = await accountFactory.build({
          superAccountId: accountId
        })

        const creditAmount = BigInt(10)
        await accountsService.deposit({
          accountId: superAccountId,
          amount: creditAmount
        })
        await expect(
          accountsService.extendCredit({
            accountId: superAccountId,
            subAccountId,
            amount: creditAmount,
            autoApply: true
          })
        ).resolves.toBeUndefined()

        const amount = BigInt(1)
        await expect(
          accountsService.settleDebt({
            accountId: superAccountId,
            subAccountId,
            amount,
            revolve
          })
        ).resolves.toBeUndefined()

        await expect(
          accountsService.getAccountBalance(superAccountId)
        ).resolves.toEqual({
          balance: amount,
          availableCredit: BigInt(0),
          creditExtended: revolve === false ? BigInt(0) : amount,
          totalBorrowed: BigInt(0),
          totalLent: creditAmount - amount
        })
        await expect(
          accountsService.getAccountBalance(accountId)
        ).resolves.toEqual({
          balance: BigInt(0),
          availableCredit: revolve === false ? BigInt(0) : amount,
          creditExtended: revolve === false ? BigInt(0) : amount,
          totalBorrowed: creditAmount - amount,
          totalLent: creditAmount - amount
        })
        await expect(
          accountsService.getAccountBalance(subAccountId)
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
      await expect(
        accountsService.settleDebt({
          accountId: uuid(),
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownAccount)
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        accountsService.settleDebt({
          accountId,
          subAccountId: uuid(),
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownSubAccount)
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        accountsService.settleDebt({
          accountId,
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })
      await expect(
        accountsService.settleDebt({
          accountId: subAccountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        accountsService.settleDebt({
          accountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.SameAccounts)
    })

    test('Returns error if amount exceeds debt', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const lentAmount = BigInt(5)
      await accountsService.deposit({
        accountId,
        amount: lentAmount
      })
      await expect(
        accountsService.extendCredit({
          accountId,
          subAccountId,
          amount: lentAmount,
          autoApply: true
        })
      ).resolves.toBeUndefined()

      const depositAmount = BigInt(5)
      await accountsService.deposit({
        accountId: subAccountId,
        amount: depositAmount
      })

      await expect(
        accountsService.settleDebt({
          accountId,
          subAccountId,
          amount: depositAmount + lentAmount
        })
      ).resolves.toEqual(CreditError.InsufficientDebt)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: lentAmount
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: depositAmount + lentAmount,
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: lentAmount,
        totalLent: BigInt(0)
      })
    })

    test('Returns error for insufficient sub-account balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const lentAmount = BigInt(5)
      await accountsService.deposit({
        accountId,
        amount: lentAmount
      })
      await expect(
        accountsService.extendCredit({
          accountId,
          subAccountId,
          amount: lentAmount,
          autoApply: true
        })
      ).resolves.toBeUndefined()

      const withdrawAmount = BigInt(1)
      await expect(
        accountsService.withdraw({
          accountId: subAccountId,
          amount: withdrawAmount
        })
      ).resolves.toBeUndefined()

      await expect(
        accountsService.settleDebt({
          accountId,
          subAccountId,
          amount: lentAmount
        })
      ).resolves.toEqual(CreditError.InsufficientBalance)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: lentAmount
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: lentAmount - withdrawAmount,
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: lentAmount,
        totalLent: BigInt(0)
      })
    })
  })
})
