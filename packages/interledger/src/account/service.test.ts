import { Model } from 'objection'
import { Transaction } from 'knex'
import { Account as Balance } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { Config } from '../config'
import {
  AccountService,
  AccountError,
  CreateOptions,
  IlpAccount,
  isAccountError,
  Pagination,
  UpdateOptions
} from './service'
import { Asset } from '../asset/model'
import { AssetService } from '../asset/service'
import { BalanceService } from '../balance/service'
import {
  AccountFactory,
  createTestServices,
  TestServices,
  randomAsset
} from '../testsHelpers'

describe('Accounts Service', (): void => {
  let accountService: AccountService
  let accountFactory: AccountFactory
  let assetService: AssetService
  let balanceService: BalanceService
  let config: typeof Config
  let services: TestServices
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      services = await createTestServices()
      ;({ accountService, assetService, balanceService, config } = services)
      accountFactory = new AccountFactory(accountService)
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
      const accountOrError = await accountService.create(account)
      expect(isAccountError(accountOrError)).toEqual(false)
      if (isAccountError(accountOrError)) {
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
      expect(accountOrError).toMatchObject(expectedAccount)
      await expect(accountService.get(accountOrError.id)).resolves.toEqual(
        accountOrError
      )
      const balances = await balanceService.get([accountOrError.balanceId])
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
      const accountOrError = await accountService.create(account)
      expect(isAccountError(accountOrError)).toEqual(false)
      if (isAccountError(accountOrError)) {
        fail()
      }
      expect(accountOrError).toMatchObject({
        ...account,
        http: {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          outgoing: account.http!.outgoing
        }
      })
      await expect(accountService.get(id)).resolves.toEqual(accountOrError)
      const balances = await balanceService.get([accountOrError.balanceId])
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

      await expect(accountService.create(account)).resolves.toEqual(
        AccountError.UnknownSuperAccount
      )

      await accountFactory.build({
        id: superAccountId,
        asset: randomAsset()
      })

      const accountOrError = await accountService.create(account)
      expect(isAccountError(accountOrError)).toEqual(false)
    })

    test('Cannot create an account with duplicate id', async (): Promise<void> => {
      const account = await accountFactory.build()
      await expect(
        accountService.create({
          id: account.id,
          asset: randomAsset()
        })
      ).resolves.toEqual(AccountError.DuplicateAccountId)
      const retrievedAccount = await accountService.get(account.id)
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

      await expect(accountService.create(account)).resolves.toEqual(
        AccountError.DuplicateIncomingToken
      )

      await expect(accountService.get(id)).resolves.toBeUndefined()
    })

    test('Cannot create an account with duplicate incoming token', async (): Promise<void> => {
      const incomingToken = uuid()
      {
        const account = {
          id: uuid(),
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
        await accountService.create(account)
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
        await expect(accountService.create(account)).resolves.toEqual(
          AccountError.DuplicateIncomingToken
        )
        await expect(accountService.get(id)).resolves.toBeUndefined()
      }
    })

    test('Auto-creates corresponding asset with liquidity and settlement accounts', async (): Promise<void> => {
      const asset = randomAsset()
      const account: CreateOptions = {
        asset
      }

      await expect(Asset.query().where(asset).first()).resolves.toBeUndefined()
      await expect(
        assetService.getLiquidityBalance(asset)
      ).resolves.toBeUndefined()
      await expect(
        assetService.getSettlementBalance(asset)
      ).resolves.toBeUndefined()

      await accountService.create(account)

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

      await expect(assetService.getLiquidityBalance(asset)).resolves.toEqual(
        BigInt(0)
      )
      await expect(assetService.getSettlementBalance(asset)).resolves.toEqual(
        BigInt(0)
      )
    })
  })

  describe('Get Account', (): void => {
    test('Can get an account', async (): Promise<void> => {
      const account = await accountFactory.build()
      await expect(accountService.get(account.id)).resolves.toEqual(account)
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(accountService.get(uuid())).resolves.toBeUndefined()
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
      const accounts = await accountService.getPage({})
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(accountsCreated[0].id)
      expect(accounts[19].id).toEqual(accountsCreated[19].id)
      expect(accounts[20]).toBeUndefined()
    })

    test('Can change forward pagination limit', async (): Promise<void> => {
      const pagination: Pagination = {
        first: 10
      }
      const accounts = await accountService.getPage({ pagination })
      expect(accounts).toHaveLength(10)
      expect(accounts[0].id).toEqual(accountsCreated[0].id)
      expect(accounts[9].id).toEqual(accountsCreated[9].id)
      expect(accounts[10]).toBeUndefined()
    }, 10_000)

    test('Can paginate forwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        after: accountsCreated[19].id
      }
      const accounts = await accountService.getPage({ pagination })
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
      const accounts = await accountService.getPage({ pagination })
      expect(accounts).toHaveLength(10)
      expect(accounts[0].id).toEqual(accountsCreated[10].id)
      expect(accounts[9].id).toEqual(accountsCreated[19].id)
      expect(accounts[10]).toBeUndefined()
    })

    test("Can't change backward pagination limit on it's own.", async (): Promise<void> => {
      const pagination: Pagination = {
        last: 10
      }
      const accounts = accountService.getPage({ pagination })
      await expect(accounts).rejects.toThrow(
        "Can't paginate backwards from the start."
      )
    })

    test('Can paginate backwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        before: accountsCreated[20].id
      }
      const accounts = await accountService.getPage({ pagination })
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
      const accounts = await accountService.getPage({ pagination })
      expect(accounts).toHaveLength(5)
      expect(accounts[0].id).toEqual(accountsCreated[5].id)
      expect(accounts[4].id).toEqual(accountsCreated[9].id)
      expect(accounts[5]).toBeUndefined()
    })

    test('Backwards/Forwards pagination results in same order.', async (): Promise<void> => {
      const paginationForwards = {
        first: 10
      }
      const accountsForwards = await accountService.getPage({
        pagination: paginationForwards
      })
      const paginationBackwards = {
        last: 10,
        before: accountsCreated[10].id
      }
      const accountsBackwards = await accountService.getPage({
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
      const accounts = await accountService.getPage({ pagination })
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(accountsCreated[20].id)
      expect(accounts[19].id).toEqual(accountsCreated[39].id)
      expect(accounts[20]).toBeUndefined()
    })

    test("Can't request less than 0 accounts", async (): Promise<void> => {
      const pagination: Pagination = {
        first: -1
      }
      const accounts = accountService.getPage({ pagination })
      await expect(accounts).rejects.toThrow('Pagination index error')
    })

    test("Can't request more than 100 accounts", async (): Promise<void> => {
      const pagination: Pagination = {
        first: 101
      }
      const accounts = accountService.getPage({ pagination })
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
      const subAccounts = await accountService.getSubAccounts(account.id)
      expect(subAccounts).toEqual(expectedSubAccounts)
    })

    test('Returns empty array for nonexistent sub-accounts', async (): Promise<void> => {
      await expect(accountService.getSubAccounts(uuid())).resolves.toEqual([])
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
      const accounts = await accountService.getPage({ superAccountId })
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(subAccounts[0].id)
      expect(accounts[19].id).toEqual(subAccounts[19].id)
      expect(accounts[20]).toBeUndefined()
    })

    test('Can change forward pagination limit', async (): Promise<void> => {
      const pagination: Pagination = {
        first: 10
      }
      const accounts = await accountService.getPage({
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
      const accounts = await accountService.getPage({
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
      const accounts = await accountService.getPage({
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
      const accounts = accountService.getPage({
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
      const accounts = await accountService.getPage({
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
      const accounts = await accountService.getPage({
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
      const accountsForwards = await accountService.getPage({
        pagination: paginationForwards,
        superAccountId
      })
      const paginationBackwards = {
        last: 10,
        before: subAccounts[10].id
      }
      const accountsBackwards = await accountService.getPage({
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
      const accounts = await accountService.getPage({
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
      const accounts = accountService.getPage({
        pagination,
        superAccountId
      })
      await expect(accounts).rejects.toThrow('Pagination index error')
    })

    test("Can't request more than 100 accounts", async (): Promise<void> => {
      const pagination: Pagination = {
        first: 101
      }
      const accounts = accountService.getPage({
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
      const accountOrError = await accountService.update(updateOptions)
      expect(isAccountError(accountOrError)).toEqual(false)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      delete updateOptions.http!.incoming
      const expectedAccount = {
        ...updateOptions,
        asset
      }
      expect(accountOrError as IlpAccount).toMatchObject(expectedAccount)
      await expect(accountService.get(id)).resolves.toEqual(accountOrError)
    })

    test('Cannot update nonexistent account', async (): Promise<void> => {
      const updateOptions: UpdateOptions = {
        id: uuid(),
        disabled: true
      }

      await expect(accountService.update(updateOptions)).resolves.toEqual(
        AccountError.UnknownAccount
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
      await expect(accountService.update(updateOptions)).resolves.toEqual(
        AccountError.DuplicateIncomingToken
      )
      await expect(accountService.get(account.id)).resolves.toEqual(account)
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
      await expect(accountService.update(updateOptions)).resolves.toEqual(
        AccountError.DuplicateIncomingToken
      )
      await expect(accountService.get(account.id)).resolves.toEqual(account)
    })
  })

  describe('Get Account Balance', (): void => {
    test("Can retrieve an account's balance", async (): Promise<void> => {
      const { id } = await accountFactory.build()

      {
        const balance = await accountService.getBalance(id)
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
      await expect(accountService.getBalance(uuid())).resolves.toBeUndefined()
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
      const account = await accountService.getByToken(incomingToken)
      expect(account?.id).toEqual(id)
    })

    test('Returns undefined if no account exists with token', async (): Promise<void> => {
      const account = await accountService.getByToken(uuid())
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
        const account = await accountService.getByDestinationAddress(ilpAddress)
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountService.getByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountService.getByDestinationAddress(
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
        const account = await accountService.getByDestinationAddress(ilpAddress)
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountService.getByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountService.getByDestinationAddress(
          ilpAddress + 'suffix'
        )
        expect(account).toBeUndefined()
      }
    })

    test('Can retrieve account by server ILP address', async (): Promise<void> => {
      const { id } = await accountFactory.build()
      const ilpAddress = config.ilpAddress + '.' + id
      {
        const account = await accountService.getByDestinationAddress(ilpAddress)
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountService.getByDestinationAddress(
          ilpAddress + '.suffix'
        )
        expect(account?.id).toEqual(id)
      }
      {
        const account = await accountService.getByDestinationAddress(
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
      const account = await accountService.getByDestinationAddress('test.nope')
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
        const staticIlpAddress = await accountService.getAddress(id)
        expect(staticIlpAddress).toEqual(ilpAddress)
      }
    })

    test("Can get account's configured peer ILP address", async (): Promise<void> => {
      const { ilpAddress, accountId: id } = config.peerAddresses[0]
      await accountFactory.build({ id })
      {
        const peerAddress = await accountService.getAddress(id)
        expect(peerAddress).toEqual(ilpAddress)
      }
    })

    test("Can get account's address by server ILP address", async (): Promise<void> => {
      const { id } = await accountFactory.build()
      {
        const ilpAddress = await accountService.getAddress(id)
        expect(ilpAddress).toEqual(config.ilpAddress + '.' + id)
      }
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(accountService.getAddress(uuid())).resolves.toBeUndefined()
    })
  })
})
