import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { CreateAccountError as CreateTbAccountError } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import {
  AccountService,
  AccountType,
  AssetAccount,
  CreateOptions
} from './service'
import {
  AccountTransferError,
  CreateAccountError,
  isAccountTransferError
} from './errors'
import { LiquidityService } from '../../liquidity/service'
import { createTestApp, TestContainer } from '../../tests/app'
import { resetGraphileDb } from '../../tests/graphileDb'
import { GraphileProducer } from '../../messaging/graphileProducer'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { truncateTables } from '../../tests/tableManager'
import { AccountFactory } from '../../tests/accountFactory'
import { randomUnit } from '../../tests/asset'

describe('Account Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let accountService: AccountService
  let accountFactory: AccountFactory
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
      accountService = await deps.use('tigerbeetleAccountService')
      const transferService = await deps.use('transferService')
      accountFactory = new AccountFactory(accountService, transferService)
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
        asset: {
          unit: randomUnit()
        },
        type: AccountType.Credit
      }
      const account = await accountService.create(options)
      expect(account).toEqual({
        id: account.id,
        ...options,
        balance: BigInt(0)
      })
      await expect(accountService.get(account.id)).resolves.toEqual(account)
    })

    test('Can create an account with specified id', async (): Promise<void> => {
      const options: CreateOptions = {
        id: uuid(),
        asset: {
          unit: randomUnit()
        },
        type: AccountType.Credit
      }
      await expect(accountService.create(options)).resolves.toEqual({
        ...options,
        balance: BigInt(0)
      })
    })

    test('Can create an account with total sent balance', async (): Promise<void> => {
      const options: CreateOptions = {
        asset: {
          unit: randomUnit()
        },
        type: AccountType.Credit,
        sentBalance: true
      }
      const account = await accountService.create(options)
      expect(account).toEqual({
        id: account.id,
        asset: options.asset,
        type: options.type,
        balance: BigInt(0),
        totalSent: BigInt(0)
      })
      await expect(accountService.get(account.id)).resolves.toEqual(account)
    })

    it('Can create an account with a receive limit', async (): Promise<void> => {
      const unit = randomUnit()
      await accountService.createAssetAccounts(unit)
      const options: CreateOptions = {
        asset: { unit },
        type: AccountType.Credit,
        receiveLimit: BigInt(123)
      }
      const account = await accountService.create(options)
      expect(account).toEqual({
        id: account.id,
        asset: options.asset,
        type: options.type,
        balance: BigInt(0),
        receiveLimit: BigInt(123 + 1)
      })
      await expect(accountService.get(account.id)).resolves.toEqual(account)
    })

    test('Can create an account with a debit balance', async (): Promise<void> => {
      const options: CreateOptions = {
        asset: {
          unit: randomUnit()
        },
        type: AccountType.Debit
      }
      const account = await accountService.create(options)
      expect(account).toEqual({
        id: account.id,
        ...options,
        balance: BigInt(0)
      })
      await expect(accountService.get(account.id)).resolves.toEqual(account)
    })

    test('Create throws on error', async (): Promise<void> => {
      const tigerbeetle = await deps.use('tigerbeetle')
      jest
        .spyOn(tigerbeetle, 'createAccounts')
        .mockImplementationOnce(async () => [
          {
            index: 0,
            code: CreateTbAccountError.exists_with_different_unit
          }
        ])

      await expect(
        accountService.create({
          asset: {
            unit: randomUnit()
          },
          type: AccountType.Credit
        })
      ).rejects.toThrowError(
        new CreateAccountError(CreateTbAccountError.exists_with_different_unit)
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

  describe('Get Account Receive Limit', (): void => {
    test("Can retrieve an account's receive limit", async (): Promise<void> => {
      const receiveLimit = BigInt(123)
      const { id } = await accountFactory.build({ receiveLimit })
      await expect(accountService.getReceiveLimit(id)).resolves.toEqual(
        BigInt(123 + 1)
      )
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(
        accountService.getReceiveLimit(uuid())
      ).resolves.toBeUndefined()
    })

    test('Returns undefined for account with no receive limit', async (): Promise<void> => {
      const { id } = await accountFactory.build()
      await expect(accountService.getReceiveLimit(id)).resolves.toBeUndefined()
    })
  })

  describe('Create Asset Accounts', (): void => {
    test("Can create an asset's accounts", async (): Promise<void> => {
      const unit = randomUnit()

      for (const account in AssetAccount) {
        if (typeof account === 'number') {
          await expect(
            accountService.getAssetAccountBalance(unit, account)
          ).resolves.toBeUndefined()
        }
      }

      await accountService.createAssetAccounts(unit)

      for (const account in AssetAccount) {
        if (typeof account === 'number') {
          await expect(
            accountService.getAssetAccountBalance(unit, account)
          ).resolves.toEqual(BigInt(0))
        }
      }
    })
  })

  describe('Get Asset Account Balance', (): void => {
    test("Can retrieve an asset accounts' balance", async (): Promise<void> => {
      const unit = randomUnit()
      await accountService.createAssetAccounts(unit)
      for (const account in AssetAccount) {
        if (typeof account === 'number') {
          await expect(
            accountService.getAssetAccountBalance(unit, account)
          ).resolves.toEqual(BigInt(0))
        }
      }
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(
        accountService.getAssetAccountBalance(
          randomUnit(),
          AssetAccount.Liquidity
        )
      ).resolves.toBeUndefined()
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
        const unit = randomUnit()
        const startingSourceBalance = BigInt(10)
        const sourceAccount = await accountFactory.build({
          asset: { unit },
          balance: startingSourceBalance
        })
        const destinationAccount = await accountFactory.build({
          asset: { unit }
        })

        const startingLiquidity = BigInt(100)
        await liquidityService.add({
          account: {
            asset: {
              unit,
              account: AssetAccount.Liquidity
            }
          },
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
        assert.ok(!isAccountTransferError(trxOrError))
        const destinationAmount = destAmt ? BigInt(destAmt) : sourceAmount
        const amountDiff = destinationAmount - sourceAmount

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance - sourceAmount)

        await expect(
          accountService.getAssetAccountBalance(unit, AssetAccount.Liquidity)
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
          accountService.getAssetAccountBalance(unit, AssetAccount.Liquidity)
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
      accept
      ${true}
      ${false}
    `(
      'Can transfer funds cross-currency with two-phase commit { accepted: $accept }',
      async ({ accept }): Promise<void> => {
        const startingSourceBalance = BigInt(10)
        const sourceAccount = await accountFactory.build({
          balance: startingSourceBalance
        })
        const destinationAccount = await accountFactory.build()
        const startingDestinationLiquidity = BigInt(100)
        await liquidityService.add({
          account: {
            asset: {
              unit: destinationAccount.asset.unit,
              account: AssetAccount.Liquidity
            }
          },
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
        assert.ok(!isAccountTransferError(trxOrError))

        await expect(
          accountService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance - sourceAmount)

        await expect(
          accountService.getAssetAccountBalance(
            sourceAccount.asset.unit,
            AssetAccount.Liquidity
          )
        ).resolves.toEqual(BigInt(0))

        await expect(
          accountService.getAssetAccountBalance(
            destinationAccount.asset.unit,
            AssetAccount.Liquidity
          )
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
          accountService.getAssetAccountBalance(
            sourceAccount.asset.unit,
            AssetAccount.Liquidity
          )
        ).resolves.toEqual(accept ? sourceAmount : BigInt(0))

        await expect(
          accountService.getAssetAccountBalance(
            destinationAccount.asset.unit,
            AssetAccount.Liquidity
          )
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
          asset: {
            unit: sameAsset ? sourceAccount.asset.unit : randomUnit()
          }
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
          accountService.getAssetAccountBalance(
            sourceAccount.asset.unit,
            AssetAccount.Liquidity
          )
        ).resolves.toEqual(BigInt(0))

        await expect(
          accountService.getAssetAccountBalance(
            destinationAccount.asset.unit,
            AssetAccount.Liquidity
          )
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
        balance: startingSourceBalance
      })

      const destinationAccount = await accountFactory.build()
      await expect(
        accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(5),
          timeout
        })
      ).resolves.toEqual(AccountTransferError.InvalidDestinationAmount)
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

    test('Cannot exceed destination receive limit', async (): Promise<void> => {
      const sourceAccount = await accountFactory.build({
        balance: BigInt(200)
      })
      const receiveLimit = BigInt(123)
      const destinationAccount = await accountFactory.build({
        asset: sourceAccount.asset,
        receiveLimit
      })
      await expect(
        accountService.transferFunds({
          sourceAccount,
          destinationAccount,
          sourceAmount: receiveLimit + BigInt(2),
          timeout
        })
      ).resolves.toEqual(AccountTransferError.ReceiveLimitExceeded)

      // ... but a smaller payment is fine
      const trxOrError = await accountService.transferFunds({
        sourceAccount,
        destinationAccount,
        sourceAmount: receiveLimit,
        timeout
      })
      expect(isAccountTransferError(trxOrError)).toEqual(false)
    })

    test.todo('Returns error timed out transfer')
  })
})
