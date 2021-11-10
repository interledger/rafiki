import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { AccountService, CreateOptions } from './service'
import {
  AccountTransferError,
  isAccountTransferError,
  UnknownAssetError
} from './errors'
import { AssetService } from '../asset/service'
import { BalanceService, BalanceType } from '../balance/service'
import { LiquidityService } from '../liquidity/service'
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
        disabled: false
      }
      expect(account).toMatchObject(expectedAccount)
      await expect(accountService.get(account.id)).resolves.toEqual(account)
      await expect(balanceService.get(account.balanceId)).resolves.toEqual({
        id: account.balanceId,
        balance: BigInt(0),
        type: BalanceType.Credit,
        unit: account.asset.unit
      })
    })

    test('Can create an account with all settings', async (): Promise<void> => {
      const options: CreateOptions = {
        disabled: false,
        assetId: (await assetService.getOrCreate(randomAsset())).id
      }
      const account = await accountService.create(options)
      expect(account).toMatchObject(options)
      await expect(accountService.get(account.id)).resolves.toEqual(account)
      await expect(balanceService.get(account.balanceId)).resolves.toEqual({
        id: account.balanceId,
        balance: BigInt(0),
        type: BalanceType.Credit,
        unit: account.asset.unit
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
        type: BalanceType.Credit,
        unit: account.asset.unit
      })
    })

    it('Can create an account with a receive limit', async (): Promise<void> => {
      const { id: assetId } = await assetService.getOrCreate(randomAsset())
      const options: CreateOptions = {
        assetId,
        receiveLimit: BigInt(123)
      }
      const account = await accountService.create(options)
      assert.ok(account.receiveLimitBalanceId)
      await expect(
        balanceService.get(account.receiveLimitBalanceId)
      ).resolves.toEqual({
        id: account.receiveLimitBalanceId,
        balance: BigInt(124),
        type: BalanceType.Debit,
        unit: account.asset.unit
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

    test('Cannot exceed an invoice receive limit', async (): Promise<void> => {
      const paymentPointerService = await deps.use('paymentPointerService')
      const invoiceService = await deps.use('invoiceService')
      const sourceAccount = await accountFactory.build({
        sentBalance: true,
        balance: BigInt(200)
      })
      const paymentPointerId = (
        await paymentPointerService.create({ asset: sourceAccount.asset })
      ).id
      const invoice = await invoiceService.create({
        paymentPointerId,
        description: 'Invoice',
        amountToReceive: BigInt(123)
      })
      await expect(
        accountService.transferFunds({
          sourceAccount,
          destinationAccount: invoice.account,
          sourceAmount: BigInt(123 + 2),
          timeout
        })
      ).resolves.toBe(AccountTransferError.ReceiveLimitExceeded)

      // ... but a smaller payment is fine
      const trxOrError = await accountService.transferFunds({
        sourceAccount,
        destinationAccount: invoice.account,
        sourceAmount: BigInt(123),
        timeout
      })
      expect(isAccountTransferError(trxOrError)).toEqual(false)
    })

    test.todo('Returns error timed out transfer')
  })
})
