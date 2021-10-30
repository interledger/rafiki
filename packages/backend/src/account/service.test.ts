import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import {
  Account,
  AccountService,
  CreateOptions,
  UpdateOptions
} from './service'
import {
  AccountError,
  isAccountError,
  AccountTransferError,
  isAccountTransferError,
  UnknownAssetError
} from './errors'
import { AssetService } from '../asset/service'
import { BalanceService } from '../balance/service'
import { LiquidityService } from '../liquidity/service'
import { Pagination } from '../shared/pagination'
import { createTestApp, TestContainer } from '../tests/app'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
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
  let liquidityService: LiquidityService
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
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
      assetService = await deps.use('assetService')
      const transferService = await deps.use('transferService')
      accountFactory = new AccountFactory(
        accountService,
        assetService,
        transferService
      )
      balanceService = await deps.use('balanceService')
      liquidityService = await deps.use('liquidityService')
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
      const options: CreateOptions = {
        assetId: (await assetService.getOrCreate(randomAsset())).id
      }
      const account = await accountService.create(options)
      const expectedAccount = {
        ...options,
        id: account.id,
        disabled: false,
        stream: {
          enabled: false
        }
      }
      expect(account).toMatchObject(expectedAccount)
      await expect(accountService.get(account.id)).resolves.toEqual(account)
      await expect(balanceService.get(account.balanceId)).resolves.toEqual({
        id: account.balanceId,
        balance: BigInt(0),
        unit: account.asset.unit,
        debitBalance: false
      })
    })

    test('Can create an account with all settings', async (): Promise<void> => {
      const options: CreateOptions = {
        disabled: false,
        assetId: (await assetService.getOrCreate(randomAsset())).id,
        maxPacketAmount: BigInt(100),
        stream: {
          enabled: true
        }
      }
      const account = await accountService.create(options)
      expect(account).toMatchObject(options)
      await expect(accountService.get(account.id)).resolves.toEqual(account)
      await expect(balanceService.get(account.balanceId)).resolves.toEqual({
        id: account.balanceId,
        balance: BigInt(0),
        unit: account.asset.unit,
        debitBalance: false
      })
    })

    test('Cannot create an account with unknown asset id', async (): Promise<void> => {
      const assetId = uuid()
      await expect(accountService.create({ assetId })).rejects.toThrowError(
        new UnknownAssetError(assetId)
      )
    })

    test('Can create an account with total sent balance', async (): Promise<void> => {
      const { id: assetId } = await assetService.getOrCreate(randomAsset())
      const options: CreateOptions = {
        assetId,
        sentBalance: true
      }
      const account = await accountService.create(options)
      assert.ok(account.sentBalanceId)
      await expect(balanceService.get(account.sentBalanceId)).resolves.toEqual({
        id: account.sentBalanceId,
        balance: BigInt(0),
        unit: account.asset.unit,
        debitBalance: false
      })
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
        const asset = randomAsset()
        for (let i = 0; i < 40; i++) {
          accountsCreated.push(await accountFactory.build({ asset }))
        }
      }
    )

    test('Defaults to fetching first 20 items', async (): Promise<void> => {
      const accounts = await accountService.getPage()
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(accountsCreated[0].id)
      expect(accounts[19].id).toEqual(accountsCreated[19].id)
      expect(accounts[20]).toBeUndefined()
    })

    test('Can change forward pagination limit', async (): Promise<void> => {
      const pagination: Pagination = {
        first: 10
      }
      const accounts = await accountService.getPage(pagination)
      expect(accounts).toHaveLength(10)
      expect(accounts[0].id).toEqual(accountsCreated[0].id)
      expect(accounts[9].id).toEqual(accountsCreated[9].id)
      expect(accounts[10]).toBeUndefined()
    }, 10_000)

    test('Can paginate forwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        after: accountsCreated[19].id
      }
      const accounts = await accountService.getPage(pagination)
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
      const accounts = await accountService.getPage(pagination)
      expect(accounts).toHaveLength(10)
      expect(accounts[0].id).toEqual(accountsCreated[10].id)
      expect(accounts[9].id).toEqual(accountsCreated[19].id)
      expect(accounts[10]).toBeUndefined()
    })

    test("Can't change backward pagination limit on it's own.", async (): Promise<void> => {
      const pagination: Pagination = {
        last: 10
      }
      const accounts = accountService.getPage(pagination)
      await expect(accounts).rejects.toThrow(
        "Can't paginate backwards from the start."
      )
    })

    test('Can paginate backwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        before: accountsCreated[20].id
      }
      const accounts = await accountService.getPage(pagination)
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
      const accounts = await accountService.getPage(pagination)
      expect(accounts).toHaveLength(5)
      expect(accounts[0].id).toEqual(accountsCreated[5].id)
      expect(accounts[4].id).toEqual(accountsCreated[9].id)
      expect(accounts[5]).toBeUndefined()
    })

    test('Backwards/Forwards pagination results in same order.', async (): Promise<void> => {
      const paginationForwards = {
        first: 10
      }
      const accountsForwards = await accountService.getPage(paginationForwards)
      const paginationBackwards = {
        last: 10,
        before: accountsCreated[10].id
      }
      const accountsBackwards = await accountService.getPage(
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
      const accounts = await accountService.getPage(pagination)
      expect(accounts).toHaveLength(20)
      expect(accounts[0].id).toEqual(accountsCreated[20].id)
      expect(accounts[19].id).toEqual(accountsCreated[39].id)
      expect(accounts[20]).toBeUndefined()
    })

    test("Can't request less than 0 accounts", async (): Promise<void> => {
      const pagination: Pagination = {
        first: -1
      }
      const accounts = accountService.getPage(pagination)
      await expect(accounts).rejects.toThrow('Pagination index error')
    })

    test("Can't request more than 100 accounts", async (): Promise<void> => {
      const pagination: Pagination = {
        first: 101
      }
      const accounts = accountService.getPage(pagination)
      await expect(accounts).rejects.toThrow('Pagination index error')
    })
  })

  describe('Update Account', (): void => {
    test('Can update an account', async (): Promise<void> => {
      const { id, asset } = await accountFactory.build({
        disabled: false,
        stream: {
          enabled: true
        }
      })
      const updateOptions: UpdateOptions = {
        id,
        disabled: true,
        maxPacketAmount: BigInt(200),
        stream: {
          enabled: false
        }
      }
      const accountOrError = await accountService.update(updateOptions)
      expect(isAccountError(accountOrError)).toEqual(false)
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
  })

  describe('Get Account Balance', (): void => {
    test("Can retrieve an account's balance", async (): Promise<void> => {
      const { id } = await accountFactory.build()
      await expect(accountService.getBalance(id)).resolves.toEqual(BigInt(0))
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(accountService.getBalance(uuid())).resolves.toBeUndefined()
    })
  })

  describe('Get Account Total Sent Balance', (): void => {
    test("Can retrieve an account's total sent balance", async (): Promise<void> => {
      const { id } = await accountFactory.build({ sentBalance: true })
      await expect(accountService.getTotalSent(id)).resolves.toEqual(BigInt(0))
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(accountService.getTotalSent(uuid())).resolves.toBeUndefined()
    })

    test('Returns undefined for account with no total sent balance', async (): Promise<void> => {
      const { id } = await accountFactory.build()
      await expect(accountService.getTotalSent(id)).resolves.toBeUndefined()
    })
  })

  describe('Transfer Funds', (): void => {
    const timeout = BigInt(10e9) // 10 seconds

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
        await liquidityService.add({
          account: sourceAccount.asset,
          amount: startingLiquidity
        })

        const sourceAmount = BigInt(srcAmt)
        const trxOrError = await accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount,
          destinationAmount: destAmt ? BigInt(destAmt) : undefined,
          timeout
        })
        expect(isAccountTransferError(trxOrError)).toEqual(false)
        if (isAccountTransferError(trxOrError)) {
          fail()
        }
        const destinationAmount = destAmt ? BigInt(destAmt) : sourceAmount
        const amountDiff = destinationAmount - sourceAmount

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance - sourceAmount)

        await expect(
          assetService.getLiquidityBalance(sourceAccount.asset)
        ).resolves.toEqual(
          sourceAmount < destinationAmount
            ? startingLiquidity - amountDiff
            : startingLiquidity
        )

        await expect(
          accountService.getBalance(destinationAccount.id)
        ).resolves.toEqual(BigInt(0))

        if (accept) {
          await expect(trxOrError.commit()).resolves.toBeUndefined()
        } else {
          await expect(trxOrError.rollback()).resolves.toBeUndefined()
        }

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toEqual(
          accept ? startingSourceBalance - sourceAmount : startingSourceBalance
        )

        await expect(
          assetService.getLiquidityBalance(sourceAccount.asset)
        ).resolves.toEqual(
          accept ? startingLiquidity - amountDiff : startingLiquidity
        )

        await expect(
          accountService.getBalance(destinationAccount.id)
        ).resolves.toEqual(accept ? destinationAmount : BigInt(0))

        await expect(trxOrError.commit()).resolves.toEqual(
          accept
            ? AccountTransferError.AlreadyCommitted
            : AccountTransferError.AlreadyRolledBack
        )
        await expect(trxOrError.rollback()).resolves.toEqual(
          accept
            ? AccountTransferError.AlreadyCommitted
            : AccountTransferError.AlreadyRolledBack
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
        await liquidityService.add({
          account: destinationAccount.asset,
          amount: startingDestinationLiquidity
        })

        const sourceAmount = BigInt(1)
        const destinationAmount = BigInt(2)
        const trxOrError = await accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount,
          destinationAmount,
          timeout
        })
        expect(isAccountTransferError(trxOrError)).toEqual(false)
        if (isAccountTransferError(trxOrError)) {
          fail()
        }

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance - sourceAmount)

        await expect(
          assetService.getLiquidityBalance(sourceAccount.asset)
        ).resolves.toEqual(BigInt(0))

        await expect(
          assetService.getLiquidityBalance(destinationAccount.asset)
        ).resolves.toEqual(startingDestinationLiquidity - destinationAmount)

        await expect(
          accountService.getBalance(destinationAccount.id)
        ).resolves.toEqual(BigInt(0))

        if (accept) {
          await expect(trxOrError.commit()).resolves.toBeUndefined()
        } else {
          await expect(trxOrError.rollback()).resolves.toBeUndefined()
        }

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toEqual(
          accept ? startingSourceBalance - sourceAmount : startingSourceBalance
        )

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
        ).resolves.toEqual(accept ? destinationAmount : BigInt(0))

        await expect(trxOrError.commit()).resolves.toEqual(
          accept
            ? AccountTransferError.AlreadyCommitted
            : AccountTransferError.AlreadyRolledBack
        )
        await expect(trxOrError.rollback()).resolves.toEqual(
          accept
            ? AccountTransferError.AlreadyCommitted
            : AccountTransferError.AlreadyRolledBack
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
        sourceAmount: BigInt(5),
        timeout
      }
      await expect(accountService.transferFunds(transfer)).resolves.toEqual(
        AccountTransferError.InsufficientBalance
      )
      await expect(
        accountService.getBalance(sourceAccount.id)
      ).resolves.toEqual(BigInt(0))
      await expect(
        accountService.getBalance(destinationAccount.id)
      ).resolves.toEqual(BigInt(0))
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
          destinationAmount,
          timeout
        }

        await expect(accountService.transferFunds(transfer)).resolves.toEqual(
          AccountTransferError.InsufficientLiquidity
        )

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance)

        await expect(
          assetService.getLiquidityBalance(sourceAccount.asset)
        ).resolves.toEqual(BigInt(0))

        await expect(
          assetService.getLiquidityBalance(destinationAccount.asset)
        ).resolves.toEqual(BigInt(0))

        await expect(
          accountService.getBalance(destinationAccount.id)
        ).resolves.toEqual(BigInt(0))
      }
    )

    test('Returns error for same accounts', async (): Promise<void> => {
      const account = await accountFactory.build()

      await expect(
        accountService.transferFunds({
          sourceAccount: account,
          destinationAccount: account,
          sourceAmount: BigInt(5),
          timeout
        })
      ).resolves.toEqual(AccountTransferError.SameAccounts)
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
          sourceAmount: BigInt(0),
          timeout
        })
      ).resolves.toEqual(AccountTransferError.InvalidSourceAmount)

      await expect(
        accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(-1),
          timeout
        })
      ).resolves.toEqual(AccountTransferError.InvalidSourceAmount)
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
          destinationAmount: BigInt(0),
          timeout
        })
      ).resolves.toEqual(AccountTransferError.InvalidDestinationAmount)

      await expect(
        accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(-1),
          timeout
        })
      ).resolves.toEqual(AccountTransferError.InvalidDestinationAmount)
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
            sourceAmount: BigInt(5),
            timeout
          })
        ).resolves.toEqual(AccountTransferError.InvalidDestinationAmount)
      }

      {
        const destinationAccount = await accountFactory.build()
        await expect(
          accountService.transferFunds({
            sourceAccount,
            destinationAccount,
            sourceAmount: BigInt(5),
            timeout
          })
        ).resolves.toEqual(AccountTransferError.InvalidDestinationAmount)
      }
    })

    test('Updates source account sent balance', async (): Promise<void> => {
      const startingSourceBalance = BigInt(10)
      const sourceAccount = await accountFactory.build({
        sentBalance: true,
        balance: startingSourceBalance
      })

      const destinationAccount = await accountFactory.build({
        asset: sourceAccount.asset
      })

      const sourceAmount = BigInt(5)

      const trxOrError = await accountService.transferFunds({
        sourceAccount,
        destinationAccount,
        sourceAmount,
        timeout
      })
      assert.ok(!isAccountTransferError(trxOrError))
      await expect(
        accountService.getTotalSent(sourceAccount.id)
      ).resolves.toEqual(BigInt(0))
      await expect(trxOrError.commit()).resolves.toBeUndefined()
      await expect(
        accountService.getTotalSent(sourceAccount.id)
      ).resolves.toEqual(sourceAmount)
    })
    test.todo('Returns error timed out transfer')
  })
})
