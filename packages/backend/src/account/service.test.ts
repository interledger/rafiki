import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import {
  Account,
  AccountService,
  AccountError,
  CreateOptions,
  isAccountError,
  isTransferError,
  TransferError,
  UpdateOptions
} from './service'
import { AssetService } from '../asset/service'
import { BalanceService, Balance } from '../balance/service'
import { DepositService } from '../deposit/service'
import { Pagination } from '../shared/pagination'
import { createTestApp, TestContainer } from '../tests/app'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config, IAppConfig } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { AccountFactory } from '../tests/accountFactory'
import { randomAsset } from '../tests/asset'

describe('Account Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let accountService: AccountService
  let accountFactory: AccountFactory
  let assetService: AssetService
  let balanceService: BalanceService
  let depositService: DepositService
  let config: IAppConfig
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

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
      deps = await initIocContainer(config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      accountService = await deps.use('accountService')
      const transferService = await deps.use('transferService')
      accountFactory = new AccountFactory(accountService, transferService)
      assetService = await deps.use('assetService')
      balanceService = await deps.use('balanceService')
      depositService = await deps.use('depositService')
      config = await deps.use('config')
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(knex)
      await appContainer.shutdown()
      await workerUtils.release()
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
      balances.forEach(({ balance }: Balance) => {
        expect(balance).toEqual(BigInt(0))
        expect(balance).toEqual(BigInt(0))
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
      balances.forEach(({ balance }: Balance) => {
        expect(balance).toEqual(BigInt(0))
        expect(balance).toEqual(BigInt(0))
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

      await expect(assetService.get(asset)).resolves.toBeUndefined()
      await expect(
        assetService.getLiquidityBalance(asset)
      ).resolves.toBeUndefined()
      await expect(
        assetService.getSettlementBalance(asset)
      ).resolves.toBeUndefined()

      await accountService.create(account)

      const newAsset = await assetService.get(asset)
      expect(newAsset).toBeDefined()
      if (!newAsset) fail()
      const balances = await balanceService.get([
        newAsset.liquidityBalanceId,
        newAsset.settlementBalanceId
      ])
      expect(balances.length).toBe(2)
      balances.forEach(({ balance }: Balance) => {
        expect(balance).toEqual(BigInt(0))
        expect(balance).toEqual(BigInt(0))
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
    let accountsCreated: Account[]

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
    let subAccounts: Account[]

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
      expect(accountOrError as Account).toMatchObject(expectedAccount)
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

  describe('Transfer Funds', (): void => {
    test.each`
      srcAmt | destAmt      | accept
      ${1}   | ${1}         | ${true}
      ${1}   | ${1}         | ${false}
      ${1}   | ${undefined} | ${true}
      ${1}   | ${undefined} | ${false}
      ${1}   | ${2}         | ${true}
      ${1}   | ${2}         | ${false}
      ${2}   | ${1}         | ${true}
      ${2}   | ${1}         | ${false}
    `(
      'Can transfer asset with two-phase commit { srcAmt: $srcAmt, destAmt: $destAmt, accepted: $accept }',
      async ({ srcAmt, destAmt, accept }): Promise<void> => {
        const startingSourceBalance = BigInt(10)
        const sourceAccount = await accountFactory.build({
          balance: startingSourceBalance
        })
        const destinationAccount = await accountFactory.build({
          asset: sourceAccount.asset
        })

        const startingLiquidity = BigInt(100)
        await depositService.createLiquidity({
          asset: sourceAccount.asset,
          amount: startingLiquidity
        })

        const sourceAmount = BigInt(srcAmt)
        const trxOrError = await accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount,
          destinationAmount: destAmt ? BigInt(destAmt) : undefined
        })
        expect(isTransferError(trxOrError)).toEqual(false)
        if (isTransferError(trxOrError)) {
          fail()
        }
        const destinationAmount = destAmt ? BigInt(destAmt) : sourceAmount
        const amountDiff = destinationAmount - sourceAmount

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toMatchObject({
          balance: startingSourceBalance - sourceAmount
        })

        await expect(
          assetService.getLiquidityBalance(sourceAccount.asset)
        ).resolves.toEqual(
          sourceAmount < destinationAmount
            ? startingLiquidity - amountDiff
            : startingLiquidity
        )

        await expect(
          accountService.getBalance(destinationAccount.id)
        ).resolves.toMatchObject({
          balance: BigInt(0)
        })

        if (accept) {
          await expect(trxOrError.commit()).resolves.toBeUndefined()
        } else {
          await expect(trxOrError.rollback()).resolves.toBeUndefined()
        }

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toMatchObject({
          balance: accept
            ? startingSourceBalance - sourceAmount
            : startingSourceBalance
        })

        await expect(
          assetService.getLiquidityBalance(sourceAccount.asset)
        ).resolves.toEqual(
          accept ? startingLiquidity - amountDiff : startingLiquidity
        )

        await expect(
          accountService.getBalance(destinationAccount.id)
        ).resolves.toMatchObject({
          balance: accept ? destinationAmount : BigInt(0)
        })

        await expect(trxOrError.commit()).resolves.toEqual(
          accept
            ? TransferError.TransferAlreadyCommitted
            : TransferError.TransferAlreadyRejected
        )
        await expect(trxOrError.rollback()).resolves.toEqual(
          accept
            ? TransferError.TransferAlreadyCommitted
            : TransferError.TransferAlreadyRejected
        )
      }
    )

    test.each`
      sameCode | accept
      ${true}  | ${true}
      ${true}  | ${false}
      ${false} | ${true}
      ${false} | ${false}
    `(
      'Can transfer funds cross-currrency with two-phase commit { sameAssetCode: $sameCode, accepted: $accept }',
      async ({ sameCode, accept }): Promise<void> => {
        const startingSourceBalance = BigInt(10)
        const sourceAccount = await accountFactory.build({
          asset: {
            code: randomAsset().code,
            scale: 10
          },
          balance: startingSourceBalance
        })
        const destinationAccount = await accountFactory.build({
          asset: {
            code: sameCode ? sourceAccount.asset.code : randomAsset().code,
            scale: sourceAccount.asset.scale + 2
          }
        })

        const startingDestinationLiquidity = BigInt(100)
        await depositService.createLiquidity({
          asset: destinationAccount.asset,
          amount: startingDestinationLiquidity
        })

        const sourceAmount = BigInt(1)
        const destinationAmount = BigInt(2)
        const trxOrError = await accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount,
          destinationAmount
        })
        expect(isTransferError(trxOrError)).toEqual(false)
        if (isTransferError(trxOrError)) {
          fail()
        }

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toMatchObject({
          balance: startingSourceBalance - sourceAmount
        })

        await expect(
          assetService.getLiquidityBalance(sourceAccount.asset)
        ).resolves.toEqual(BigInt(0))

        await expect(
          assetService.getLiquidityBalance(destinationAccount.asset)
        ).resolves.toEqual(startingDestinationLiquidity - destinationAmount)

        await expect(
          accountService.getBalance(destinationAccount.id)
        ).resolves.toMatchObject({
          balance: BigInt(0)
        })

        if (accept) {
          await expect(trxOrError.commit()).resolves.toBeUndefined()
        } else {
          await expect(trxOrError.rollback()).resolves.toBeUndefined()
        }

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toMatchObject({
          balance: accept
            ? startingSourceBalance - sourceAmount
            : startingSourceBalance
        })

        await expect(
          assetService.getLiquidityBalance(sourceAccount.asset)
        ).resolves.toEqual(accept ? sourceAmount : BigInt(0))

        await expect(
          assetService.getLiquidityBalance(destinationAccount.asset)
        ).resolves.toEqual(
          accept
            ? startingDestinationLiquidity - destinationAmount
            : startingDestinationLiquidity
        )

        await expect(
          accountService.getBalance(destinationAccount.id)
        ).resolves.toMatchObject({
          balance: accept ? destinationAmount : BigInt(0)
        })

        await expect(trxOrError.commit()).resolves.toEqual(
          accept
            ? TransferError.TransferAlreadyCommitted
            : TransferError.TransferAlreadyRejected
        )
        await expect(trxOrError.rollback()).resolves.toEqual(
          accept
            ? TransferError.TransferAlreadyCommitted
            : TransferError.TransferAlreadyRejected
        )
      }
    )

    test('Returns error for insufficient source balance', async (): Promise<void> => {
      const sourceAccount = await accountFactory.build()
      const destinationAccount = await accountFactory.build({
        asset: sourceAccount.asset
      })
      const transfer = {
        sourceAccount,
        destinationAccount,
        sourceAmount: BigInt(5)
      }
      await expect(accountService.transferFunds(transfer)).resolves.toEqual(
        TransferError.InsufficientBalance
      )
      await expect(
        accountService.getBalance(sourceAccount.id)
      ).resolves.toMatchObject({ balance: BigInt(0) })
      await expect(
        accountService.getBalance(destinationAccount.id)
      ).resolves.toMatchObject({ balance: BigInt(0) })
    })

    test.each`
      sameAsset
      ${true}
      ${false}
    `(
      'Returns error for insufficient destination liquidity balance { sameAsset: $sameAsset }',
      async ({ sameAsset }): Promise<void> => {
        const startingSourceBalance = BigInt(10)
        const sourceAccount = await accountFactory.build({
          balance: startingSourceBalance
        })
        const destinationAccount = await accountFactory.build({
          asset: sameAsset ? sourceAccount.asset : randomAsset()
        })
        const sourceAmount = BigInt(5)
        const destinationAmount = BigInt(10)
        const transfer = {
          sourceAccount,
          destinationAccount,
          sourceAmount,
          destinationAmount
        }

        await expect(accountService.transferFunds(transfer)).resolves.toEqual(
          TransferError.InsufficientLiquidity
        )

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toMatchObject({
          balance: startingSourceBalance
        })

        await expect(
          assetService.getLiquidityBalance(sourceAccount.asset)
        ).resolves.toEqual(BigInt(0))

        await expect(
          assetService.getLiquidityBalance(destinationAccount.asset)
        ).resolves.toEqual(BigInt(0))

        await expect(
          accountService.getBalance(destinationAccount.id)
        ).resolves.toMatchObject({
          balance: BigInt(0)
        })
      }
    )

    test('Returns error for same accounts', async (): Promise<void> => {
      const account = await accountFactory.build()

      await expect(
        accountService.transferFunds({
          sourceAccount: account,
          destinationAccount: account,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.SameAccounts)
    })

    test('Returns error for invalid source amount', async (): Promise<void> => {
      const startingSourceBalance = BigInt(10)
      const sourceAccount = await accountFactory.build({
        balance: startingSourceBalance
      })
      const destinationAccount = await accountFactory.build({
        asset: sourceAccount.asset
      })

      await expect(
        accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(0)
        })
      ).resolves.toEqual(TransferError.InvalidSourceAmount)

      await expect(
        accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(-1)
        })
      ).resolves.toEqual(TransferError.InvalidSourceAmount)
    })

    test('Returns error for invalid destination amount', async (): Promise<void> => {
      const startingSourceBalance = BigInt(10)
      const sourceAccount = await accountFactory.build({
        balance: startingSourceBalance
      })
      const destinationAccount = await accountFactory.build()

      await expect(
        accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(0)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)

      await expect(
        accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(-1)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)
    })

    test('Returns error for missing destination amount', async (): Promise<void> => {
      const startingSourceBalance = BigInt(10)
      const sourceAccount = await accountFactory.build({
        asset: {
          code: randomAsset().code,
          scale: 10
        },
        balance: startingSourceBalance
      })

      {
        const destinationAccount = await accountFactory.build({
          asset: {
            code: sourceAccount.asset.code,
            scale: sourceAccount.asset.scale + 1
          }
        })
        await expect(
          accountService.transferFunds({
            sourceAccount,
            destinationAccount,
            sourceAmount: BigInt(5)
          })
        ).resolves.toEqual(TransferError.InvalidDestinationAmount)
      }

      {
        const destinationAccount = await accountFactory.build()
        await expect(
          accountService.transferFunds({
            sourceAccount,
            destinationAccount,
            sourceAmount: BigInt(5)
          })
        ).resolves.toEqual(TransferError.InvalidDestinationAmount)
      }
    })

    test.todo('Returns error timed out transfer')
  })
})
