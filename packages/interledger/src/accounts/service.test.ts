import { Model } from 'objection'
import { Transaction } from 'knex'
import { Account as Balance } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { Config } from '../config'
import { IlpAccount as IlpAccountModel } from './models'
import { AccountsService } from './service'
import { Asset } from '../asset/model'
import { BalanceService } from '../balance/service'
import { DepositService } from '../deposit/service'
import {
  AccountFactory,
  createTestServices,
  TestServices,
  randomAsset
} from '../testsHelpers'

import {
  CreateAccountError,
  CreateOptions,
  IlpAccount,
  isCreateAccountError,
  isUpdateAccountError,
  Pagination,
  UpdateAccountError,
  UpdateOptions
} from './types'

describe('Accounts Service', (): void => {
  let accountsService: AccountsService
  let accountFactory: AccountFactory
  let balanceService: BalanceService
  let config: typeof Config
  let depositService: DepositService
  let services: TestServices
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      services = await createTestServices()
      ;({ accountsService, balanceService, config, depositService } = services)
      accountFactory = new AccountFactory(accountsService)
    }
  )

  beforeEach(
    async (): Promise<void> => {
      trx = await services.knex.transaction()
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
      await services.shutdown()
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
      const balances = await balanceService.get([retrievedAccount.balanceId])
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
      const balances = await balanceService.get([retrievedAccount.balanceId])
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

    test('Auto-creates corresponding asset with liquidity and settlement accounts', async (): Promise<void> => {
      const asset = randomAsset()
      const account: CreateOptions = {
        asset
      }

      await expect(Asset.query().where(asset).first()).resolves.toBeUndefined()
      await expect(
        accountsService.getLiquidityBalance(asset)
      ).resolves.toBeUndefined()
      await expect(
        accountsService.getSettlementBalance(asset)
      ).resolves.toBeUndefined()

      await accountsService.createAccount(account)

      const newAsset = await Asset.query().where(asset).first()
      expect(newAsset).toBeDefined()
      const balances = await balanceService.get([
        newAsset.liquidityBalanceId,
        newAsset.settlementBalanceId
      ])
      expect(balances.length).toBe(2)
      balances.forEach((balance: Balance) => {
        expect(balance.credits_reserved).toEqual(BigInt(0))
        expect(balance.credits_accepted).toEqual(BigInt(0))
      })

      await expect(accountsService.getLiquidityBalance(asset)).resolves.toEqual(
        BigInt(0)
      )
      await expect(
        accountsService.getSettlementBalance(asset)
      ).resolves.toEqual(BigInt(0))
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
      const accounts = await accountsService.getAccountsPage({})
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(accountsCreated[0].id)
      expect(accounts[19].id).toEqual(accountsCreated[19].id)
      expect(accounts[20]).toBeUndefined()
    })

    test('Can change forward pagination limit', async (): Promise<void> => {
      const pagination: Pagination = {
        first: 10
      }
      const accounts = await accountsService.getAccountsPage({ pagination })
      expect(accounts).toHaveLength(10)
      expect(accounts[0].id).toEqual(accountsCreated[0].id)
      expect(accounts[9].id).toEqual(accountsCreated[9].id)
      expect(accounts[10]).toBeUndefined()
    }, 10_000)

    test('Can paginate forwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        after: accountsCreated[19].id
      }
      const accounts = await accountsService.getAccountsPage({ pagination })
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
      const accounts = await accountsService.getAccountsPage({ pagination })
      expect(accounts).toHaveLength(10)
      expect(accounts[0].id).toEqual(accountsCreated[10].id)
      expect(accounts[9].id).toEqual(accountsCreated[19].id)
      expect(accounts[10]).toBeUndefined()
    })

    test("Can't change backward pagination limit on it's own.", async (): Promise<void> => {
      const pagination: Pagination = {
        last: 10
      }
      const accounts = accountsService.getAccountsPage({ pagination })
      await expect(accounts).rejects.toThrow(
        "Can't paginate backwards from the start."
      )
    })

    test('Can paginate backwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        before: accountsCreated[20].id
      }
      const accounts = await accountsService.getAccountsPage({ pagination })
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
      const accounts = await accountsService.getAccountsPage({ pagination })
      expect(accounts).toHaveLength(5)
      expect(accounts[0].id).toEqual(accountsCreated[5].id)
      expect(accounts[4].id).toEqual(accountsCreated[9].id)
      expect(accounts[5]).toBeUndefined()
    })

    test('Backwards/Forwards pagination results in same order.', async (): Promise<void> => {
      const paginationForwards = {
        first: 10
      }
      const accountsForwards = await accountsService.getAccountsPage({
        pagination: paginationForwards
      })
      const paginationBackwards = {
        last: 10,
        before: accountsCreated[10].id
      }
      const accountsBackwards = await accountsService.getAccountsPage({
        pagination: paginationBackwards
      })
      expect(accountsForwards).toHaveLength(10)
      expect(accountsBackwards).toHaveLength(10)
      expect(accountsForwards).toEqual(accountsBackwards)
    })

    test('Providing before and after results in forward pagination', async (): Promise<void> => {
      const pagination: Pagination = {
        after: accountsCreated[19].id,
        before: accountsCreated[19].id
      }
      const accounts = await accountsService.getAccountsPage({ pagination })
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(accountsCreated[20].id)
      expect(accounts[19].id).toEqual(accountsCreated[39].id)
      expect(accounts[20]).toBeUndefined()
    })

    test("Can't request less than 0 accounts", async (): Promise<void> => {
      const pagination: Pagination = {
        first: -1
      }
      const accounts = accountsService.getAccountsPage({ pagination })
      await expect(accounts).rejects.toThrow('Pagination index error')
    })

    test("Can't request more than 100 accounts", async (): Promise<void> => {
      const pagination: Pagination = {
        first: 101
      }
      const accounts = accountsService.getAccountsPage({ pagination })
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

  describe('Sub-Account pagination', (): void => {
    let superAccountId: string
    let subAccounts: IlpAccount[]

    beforeEach(
      async (): Promise<void> => {
        ;({ id: superAccountId } = await accountFactory.build())
        subAccounts = []
        for (let i = 0; i < 40; i++) {
          subAccounts.push(
            await accountFactory.build({
              superAccountId
            })
          )
        }
      }
    )

    test('Defaults to fetching first 20 items', async (): Promise<void> => {
      const accounts = await accountsService.getAccountsPage({ superAccountId })
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(subAccounts[0].id)
      expect(accounts[19].id).toEqual(subAccounts[19].id)
      expect(accounts[20]).toBeUndefined()
    })

    test('Can change forward pagination limit', async (): Promise<void> => {
      const pagination: Pagination = {
        first: 10
      }
      const accounts = await accountsService.getAccountsPage({
        pagination,
        superAccountId
      })
      expect(accounts).toHaveLength(10)
      expect(accounts[0].id).toEqual(subAccounts[0].id)
      expect(accounts[9].id).toEqual(subAccounts[9].id)
      expect(accounts[10]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        after: subAccounts[19].id
      }
      const accounts = await accountsService.getAccountsPage({
        pagination,
        superAccountId
      })
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(subAccounts[20].id)
      expect(accounts[19].id).toEqual(subAccounts[39].id)
      expect(accounts[20]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor with a limit', async (): Promise<void> => {
      const pagination: Pagination = {
        first: 10,
        after: subAccounts[9].id
      }
      const accounts = await accountsService.getAccountsPage({
        pagination,
        superAccountId
      })
      expect(accounts).toHaveLength(10)
      expect(accounts[0].id).toEqual(subAccounts[10].id)
      expect(accounts[9].id).toEqual(subAccounts[19].id)
      expect(accounts[10]).toBeUndefined()
    })

    test("Can't change backward pagination limit on it's own.", async (): Promise<void> => {
      const pagination: Pagination = {
        last: 10
      }
      const accounts = accountsService.getAccountsPage({
        pagination,
        superAccountId
      })
      await expect(accounts).rejects.toThrow(
        "Can't paginate backwards from the start."
      )
    })

    test('Can paginate backwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        before: subAccounts[20].id
      }
      const accounts = await accountsService.getAccountsPage({
        pagination,
        superAccountId
      })
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(subAccounts[0].id)
      expect(accounts[19].id).toEqual(subAccounts[19].id)
      expect(accounts[20]).toBeUndefined()
    })

    test('Can paginate backwards from a cursor with a limit', async (): Promise<void> => {
      const pagination: Pagination = {
        last: 5,
        before: subAccounts[10].id
      }
      const accounts = await accountsService.getAccountsPage({
        pagination,
        superAccountId
      })
      expect(accounts).toHaveLength(5)
      expect(accounts[0].id).toEqual(subAccounts[5].id)
      expect(accounts[4].id).toEqual(subAccounts[9].id)
      expect(accounts[5]).toBeUndefined()
    })

    test('Backwards/Forwards pagination results in same order.', async (): Promise<void> => {
      const paginationForwards = {
        first: 10
      }
      const accountsForwards = await accountsService.getAccountsPage({
        pagination: paginationForwards,
        superAccountId
      })
      const paginationBackwards = {
        last: 10,
        before: subAccounts[10].id
      }
      const accountsBackwards = await accountsService.getAccountsPage({
        pagination: paginationBackwards,
        superAccountId
      })
      expect(accountsForwards).toHaveLength(10)
      expect(accountsBackwards).toHaveLength(10)
      expect(accountsForwards).toEqual(accountsBackwards)
    })

    test('Providing before and after results in forward pagination', async (): Promise<void> => {
      const pagination: Pagination = {
        after: subAccounts[19].id,
        before: subAccounts[19].id
      }
      const accounts = await accountsService.getAccountsPage({
        pagination,
        superAccountId
      })
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(subAccounts[20].id)
      expect(accounts[19].id).toEqual(subAccounts[39].id)
      expect(accounts[20]).toBeUndefined()
    })

    test("Can't request less than 0 accounts", async (): Promise<void> => {
      const pagination: Pagination = {
        first: -1
      }
      const accounts = accountsService.getAccountsPage({
        pagination,
        superAccountId
      })
      await expect(accounts).rejects.toThrow('Pagination index error')
    })

    test("Can't request more than 100 accounts", async (): Promise<void> => {
      const pagination: Pagination = {
        first: 101
      }
      const accounts = accountsService.getAccountsPage({
        pagination,
        superAccountId
      })
      await expect(accounts).rejects.toThrow('Pagination index error')
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
        const balance = await accountsService.getLiquidityBalance(asset)
        expect(balance).toEqual(BigInt(0))
      }

      const amount = BigInt(10)
      await depositService.createLiquidity({
        asset,
        amount
      })

      {
        const balance = await accountsService.getLiquidityBalance(asset)
        expect(balance).toEqual(amount)
      }
    })

    test('Returns undefined for nonexistent liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      await expect(
        accountsService.getLiquidityBalance(asset)
      ).resolves.toBeUndefined()
    })
  })

  describe('Get Settlement Balance', (): void => {
    test('Can retrieve settlement account balance', async (): Promise<void> => {
      const { asset } = await accountFactory.build()

      {
        const balance = await accountsService.getSettlementBalance(asset)
        expect(balance).toEqual(BigInt(0))
      }

      const amount = BigInt(10)
      await depositService.createLiquidity({
        asset,
        amount
      })

      {
        const balance = await accountsService.getSettlementBalance(asset)
        expect(balance).toEqual(amount)
      }
    })

    test('Returns undefined for nonexistent settlement account', async (): Promise<void> => {
      const asset = randomAsset()
      await expect(
        accountsService.getSettlementBalance(asset)
      ).resolves.toBeUndefined()
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
})
