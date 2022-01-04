import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { StartedTestContainer } from 'testcontainers'
import { CreateAccountError as CreateTbAccountError } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import {
  AccountingService,
  AccountOptions,
  Deposit,
  Withdrawal
} from './service'
import { CreateAccountError, TransferError, isTransferError } from './errors'
import { createTestApp, TestContainer } from '../tests/app'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import {
  startTigerbeetleContainer,
  TIGERBEETLE_PORT
} from '../tests/tigerbeetle'
import { AccountFactory } from '../tests/accountFactory'

describe('Accounting Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let accountingService: AccountingService
  let accountFactory: AccountFactory
  let tigerbeetleContainer: StartedTestContainer
  const timeout = BigInt(10e9) // 10 seconds
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  let unit = 1
  function newUnit() {
    return unit++
  }

  beforeAll(
    async (): Promise<void> => {
      tigerbeetleContainer = await startTigerbeetleContainer()
      Config.tigerbeetleReplicaAddresses = [
        tigerbeetleContainer.getMappedPort(TIGERBEETLE_PORT)
      ]
      deps = await initIocContainer(Config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
      accountingService = await deps.use('accountingService')
      accountFactory = new AccountFactory(accountingService, newUnit)
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
      await tigerbeetleContainer.stop()
    }
  )

  describe('Create Account', (): void => {
    test('Can create an account', async (): Promise<void> => {
      const options: AccountOptions = {
        id: uuid(),
        asset: {
          unit: newUnit()
        }
      }
      const account = await accountingService.createAccount(options)
      expect(account).toEqual({
        ...options,
        balance: BigInt(0)
      })
      await expect(accountingService.getAccount(account.id)).resolves.toEqual(
        account
      )
    })

    test('Create throws on invalid id', async (): Promise<void> => {
      await expect(
        accountingService.createAccount({
          id: 'not a uuid',
          asset: {
            unit: newUnit()
          }
        })
      ).rejects.toThrowError('unable to create account, invalid id')
    })

    test('Create throws on error', async (): Promise<void> => {
      const tigerbeetle = await deps.use('tigerbeetle')
      jest.spyOn(tigerbeetle, 'createAccounts').mockResolvedValueOnce([
        {
          index: 0,
          code: CreateTbAccountError.exists_with_different_unit
        }
      ])

      await expect(
        accountingService.createAccount({
          id: uuid(),
          asset: {
            unit: newUnit()
          }
        })
      ).rejects.toThrowError(
        new CreateAccountError(CreateTbAccountError.exists_with_different_unit)
      )
    })
  })

  describe('Get Account', (): void => {
    test('Can get an account', async (): Promise<void> => {
      const account = await accountFactory.build()
      await expect(accountingService.getAccount(account.id)).resolves.toEqual(
        account
      )
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(
        accountingService.getAccount(uuid())
      ).resolves.toBeUndefined()
    })
  })

  describe('Get Account Balance', (): void => {
    test("Can retrieve an account's balance", async (): Promise<void> => {
      const { id } = await accountFactory.build()
      await expect(accountingService.getBalance(id)).resolves.toEqual(BigInt(0))
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(
        accountingService.getBalance(uuid())
      ).resolves.toBeUndefined()
    })
  })

  describe('Get Account Total Sent', (): void => {
    test("Can retrieve an account's total amount sent", async (): Promise<void> => {
      const { id } = await accountFactory.build()
      await expect(accountingService.getTotalSent(id)).resolves.toEqual(
        BigInt(0)
      )
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(
        accountingService.getTotalSent(uuid())
      ).resolves.toBeUndefined()
    })
  })

  describe('Get Account Total Received', (): void => {
    test("Can retrieve an account's total amount received", async (): Promise<void> => {
      const amount = BigInt(10)
      const { id } = await accountFactory.build({ balance: amount })
      await expect(accountingService.getTotalReceived(id)).resolves.toEqual(
        amount
      )
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(
        accountingService.getTotalReceived(uuid())
      ).resolves.toBeUndefined()
    })
  })

  describe('Create Asset Accounts', (): void => {
    test("Can create an asset's accounts", async (): Promise<void> => {
      const unit = newUnit()

      await expect(
        accountingService.getAssetLiquidityBalance(unit)
      ).resolves.toBeUndefined()
      await expect(
        accountingService.getAssetSettlementBalance(unit)
      ).resolves.toBeUndefined()

      await accountingService.createAssetAccounts(unit)

      await expect(
        accountingService.getAssetLiquidityBalance(unit)
      ).resolves.toEqual(BigInt(0))
      await expect(
        accountingService.getAssetSettlementBalance(unit)
      ).resolves.toEqual(BigInt(0))
    })
  })

  describe('Get Asset Liquidity Balance', (): void => {
    test("Can retrieve an asset liquidity' balance", async (): Promise<void> => {
      const unit = newUnit()
      await accountingService.createAssetAccounts(unit)
      await expect(
        accountingService.getAssetLiquidityBalance(unit)
      ).resolves.toEqual(BigInt(0))
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(
        accountingService.getAssetLiquidityBalance(newUnit())
      ).resolves.toBeUndefined()
    })
  })

  describe('Get Asset Settlement Balance', (): void => {
    test("Can retrieve an asset accounts' balance", async (): Promise<void> => {
      const unit = newUnit()
      await accountingService.createAssetAccounts(unit)
      await expect(
        accountingService.getAssetSettlementBalance(unit)
      ).resolves.toEqual(BigInt(0))
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(
        accountingService.getAssetSettlementBalance(newUnit())
      ).resolves.toBeUndefined()
    })
  })

  describe('Transfer Funds', (): void => {
    describe.each`
      sameAsset | description
      ${true}   | ${'same asset'}
      ${false}  | ${'cross-currency'}
    `('$description', ({ sameAsset }): void => {
      let sourceAccount: AccountOptions
      let destinationAccount: AccountOptions
      const startingSourceBalance = BigInt(10)
      const startingDestinationLiquidity = BigInt(100)

      beforeEach(
        async (): Promise<void> => {
          sourceAccount = await accountFactory.build({
            balance: startingSourceBalance
          })
          destinationAccount = await accountFactory.build({
            asset: sameAsset ? sourceAccount.asset : undefined
          })
          await expect(
            accountingService.createDeposit({
              id: uuid(),
              asset: {
                unit: destinationAccount.asset.unit
              },
              amount: startingDestinationLiquidity
            })
          ).resolves.toBeUndefined()
        }
      )

      describe.each`
        sourceAmount | destinationAmount | description
        ${BigInt(1)} | ${BigInt(1)}      | ${'same amount'}
        ${BigInt(1)} | ${BigInt(2)}      | ${'source < destination'}
        ${BigInt(2)} | ${BigInt(1)}      | ${'destination < source'}
      `('$description', ({ sourceAmount, destinationAmount }): void => {
        test.each`
          commit   | description
          ${true}  | ${'commit'}
          ${false} | ${'rollback'}
        `(
          '$description',
          async ({ commit }): Promise<void> => {
            const trxOrError = await accountingService.createTransfer({
              sourceAccount,
              destinationAccount,
              sourceAmount,
              destinationAmount,
              timeout
            })
            assert.ok(!isTransferError(trxOrError))
            const amountDiff = BigInt(destinationAmount - sourceAmount)

            await expect(
              accountingService.getBalance(sourceAccount.id)
            ).resolves.toEqual(startingSourceBalance - sourceAmount)

            if (sameAsset) {
              await expect(
                accountingService.getAssetLiquidityBalance(
                  sourceAccount.asset.unit
                )
              ).resolves.toEqual(
                sourceAmount < destinationAmount
                  ? startingDestinationLiquidity - amountDiff
                  : startingDestinationLiquidity
              )
            } else {
              await expect(
                accountingService.getAssetLiquidityBalance(
                  sourceAccount.asset.unit
                )
              ).resolves.toEqual(BigInt(0))

              await expect(
                accountingService.getAssetLiquidityBalance(
                  destinationAccount.asset.unit
                )
              ).resolves.toEqual(
                startingDestinationLiquidity - destinationAmount
              )
            }

            await expect(
              accountingService.getBalance(destinationAccount.id)
            ).resolves.toEqual(BigInt(0))

            if (commit) {
              await expect(trxOrError.commit()).resolves.toBeUndefined()
            } else {
              await expect(trxOrError.rollback()).resolves.toBeUndefined()
            }

            await expect(
              accountingService.getBalance(sourceAccount.id)
            ).resolves.toEqual(
              commit
                ? startingSourceBalance - sourceAmount
                : startingSourceBalance
            )

            if (sameAsset) {
              await expect(
                accountingService.getAssetLiquidityBalance(
                  sourceAccount.asset.unit
                )
              ).resolves.toEqual(
                commit
                  ? startingDestinationLiquidity - amountDiff
                  : startingDestinationLiquidity
              )
            } else {
              await expect(
                accountingService.getAssetLiquidityBalance(
                  sourceAccount.asset.unit
                )
              ).resolves.toEqual(commit ? sourceAmount : BigInt(0))

              await expect(
                accountingService.getAssetLiquidityBalance(
                  destinationAccount.asset.unit
                )
              ).resolves.toEqual(
                commit
                  ? startingDestinationLiquidity - destinationAmount
                  : startingDestinationLiquidity
              )
            }

            await expect(
              accountingService.getBalance(destinationAccount.id)
            ).resolves.toEqual(commit ? destinationAmount : BigInt(0))

            await expect(trxOrError.commit()).resolves.toEqual(
              commit
                ? TransferError.AlreadyCommitted
                : TransferError.AlreadyRolledBack
            )
            await expect(trxOrError.rollback()).resolves.toEqual(
              commit
                ? TransferError.AlreadyCommitted
                : TransferError.AlreadyRolledBack
            )
          }
        )
      })

      test('Returns error for insufficient source balance', async (): Promise<void> => {
        const transfer = {
          sourceAccount,
          destinationAccount,
          sourceAmount: startingSourceBalance + BigInt(1),
          destinationAmount: BigInt(5),
          timeout
        }
        await expect(
          accountingService.createTransfer(transfer)
        ).resolves.toEqual(TransferError.InsufficientBalance)
        await expect(
          accountingService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance)
      })

      test('Returns error for insufficient destination liquidity balance', async (): Promise<void> => {
        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount,
            sourceAmount: BigInt(1),
            destinationAmount: startingDestinationLiquidity + BigInt(2),
            timeout
          })
        ).resolves.toEqual(TransferError.InsufficientLiquidity)
      })

      test('Returns error for same accounts', async (): Promise<void> => {
        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount: sourceAccount,
            sourceAmount: BigInt(5),
            destinationAmount: BigInt(5),
            timeout
          })
        ).resolves.toEqual(TransferError.SameAccounts)
      })

      test('Returns error for invalid source amount', async (): Promise<void> => {
        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount,
            sourceAmount: BigInt(0),
            destinationAmount: BigInt(1),
            timeout
          })
        ).resolves.toEqual(TransferError.InvalidSourceAmount)

        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount,
            sourceAmount: BigInt(-1),
            destinationAmount: BigInt(1),
            timeout
          })
        ).resolves.toEqual(TransferError.InvalidSourceAmount)
      })

      test('Returns error for invalid destination amount', async (): Promise<void> => {
        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount,
            sourceAmount: BigInt(5),
            destinationAmount: BigInt(0),
            timeout
          })
        ).resolves.toEqual(TransferError.InvalidDestinationAmount)

        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount,
            sourceAmount: BigInt(5),
            destinationAmount: BigInt(-1),
            timeout
          })
        ).resolves.toEqual(TransferError.InvalidDestinationAmount)
      })

      test.todo('Returns error timed out transfer')
    })
  })

  describe.each`
    asset    | description
    ${true}  | ${'Asset Liquidity'}
    ${false} | ${'Account'}
  `(`Create $description Deposit`, (asset): void => {
    let deposit: Deposit
    let unit: number

    beforeEach(
      async (): Promise<void> => {
        const account = await accountFactory.build()
        unit = account.asset.unit
        const id = uuid()
        const amount = BigInt(10)
        if (asset) {
          deposit = {
            id,
            asset: { unit },
            amount
          }
          await expect(
            accountingService.getAssetLiquidityBalance(unit)
          ).resolves.toEqual(BigInt(0))
        } else {
          deposit = {
            id,
            accountId: account.id,
            amount
          }
          await expect(
            accountingService.getBalance(account.id)
          ).resolves.toEqual(BigInt(0))
        }
        await expect(
          accountingService.getAssetSettlementBalance(unit)
        ).resolves.toEqual(BigInt(0))
      }
    )

    test('A deposit can be created', async (): Promise<void> => {
      await expect(
        accountingService.createDeposit(deposit)
      ).resolves.toBeUndefined()
      if (deposit.accountId) {
        await expect(
          accountingService.getBalance(deposit.accountId)
        ).resolves.toEqual(deposit.amount)
      } else {
        await expect(
          accountingService.getAssetLiquidityBalance(unit)
        ).resolves.toEqual(deposit.amount)
      }
      await expect(
        accountingService.getAssetSettlementBalance(unit)
      ).resolves.toEqual(deposit.amount)
    })

    test('Cannot create deposit with invalid id', async (): Promise<void> => {
      deposit.id = 'not a uuid'
      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        TransferError.InvalidId
      )
    })

    test('Cannot create duplicate deposit', async (): Promise<void> => {
      await expect(
        accountingService.createDeposit(deposit)
      ).resolves.toBeUndefined()

      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        TransferError.TransferExists
      )

      deposit.amount = BigInt(5)
      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        TransferError.TransferExists
      )
    })

    test('Cannot deposit to unknown account', async (): Promise<void> => {
      if (deposit.asset) {
        deposit.asset.unit = newUnit()
      } else {
        deposit.accountId = uuid()
      }
      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        asset
          ? TransferError.UnknownSourceAccount
          : TransferError.UnknownDestinationAccount
      )
    })

    test('Cannot deposit zero', async (): Promise<void> => {
      deposit.amount = BigInt(0)
      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        TransferError.InvalidAmount
      )
    })

    test('Cannot deposit deposit amount', async (): Promise<void> => {
      deposit.amount = -BigInt(10)
      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        TransferError.InvalidAmount
      )
    })
  })

  describe.each`
    asset    | description
    ${true}  | ${'Asset Liquidity'}
    ${false} | ${'Account'}
  `(`$description Withdrawal`, (asset): void => {
    let withdrawal: Withdrawal
    let unit: number
    const startingBalance = BigInt(10)
    beforeEach(
      async (): Promise<void> => {
        const account = await accountFactory.build({
          balance: asset ? BigInt(0) : startingBalance
        })
        unit = account.asset.unit
        const id = uuid()
        const amount = BigInt(1)
        if (asset) {
          withdrawal = {
            id,
            asset: { unit },
            amount,
            timeout
          }
          await expect(
            accountingService.createDeposit({
              id: uuid(),
              asset: { unit },
              amount: startingBalance
            })
          ).resolves.toBeUndefined()
          await expect(
            accountingService.getAssetLiquidityBalance(unit)
          ).resolves.toEqual(startingBalance)
        } else {
          withdrawal = {
            id,
            accountId: account.id,
            amount,
            timeout
          }
          await expect(
            accountingService.getBalance(account.id)
          ).resolves.toEqual(startingBalance)
        }
        await expect(
          accountingService.getAssetSettlementBalance(unit)
        ).resolves.toEqual(startingBalance)
      }
    )

    describe('Create', (): void => {
      test('A withdrawal can be created', async (): Promise<void> => {
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toBeUndefined()
        if (withdrawal.accountId) {
          await expect(
            accountingService.getBalance(withdrawal.accountId)
          ).resolves.toEqual(startingBalance - withdrawal.amount)
        } else {
          await expect(
            accountingService.getAssetLiquidityBalance(unit)
          ).resolves.toEqual(startingBalance - withdrawal.amount)
        }
        await expect(
          accountingService.getAssetSettlementBalance(unit)
        ).resolves.toEqual(startingBalance)
      })

      test('Cannot create withdrawal with invalid id', async (): Promise<void> => {
        withdrawal.id = 'not a uuid'
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.InvalidId)
      })

      test('Cannot create duplicate withdrawal', async (): Promise<void> => {
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toBeUndefined()

        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.TransferExists)

        withdrawal.amount = BigInt(2)
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.TransferExists)
      })

      test('Cannot withdraw from unknown account', async (): Promise<void> => {
        if (withdrawal.accountId) {
          withdrawal.accountId = uuid()
        } else {
          withdrawal.asset = {
            unit: newUnit()
          }
        }
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.UnknownSourceAccount)
      })

      test('Cannot withdraw zero', async (): Promise<void> => {
        withdrawal.amount = BigInt(0)
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.InvalidAmount)
      })

      test('Cannot withdraw negative amount', async (): Promise<void> => {
        withdrawal.amount = -BigInt(10)
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.InvalidAmount)
      })

      test('Cannot create withdraw exceeding account balance', async (): Promise<void> => {
        withdrawal.amount = startingBalance + BigInt(1)
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.InsufficientBalance)
      })
    })

    describe('Commit', (): void => {
      beforeEach(
        async (): Promise<void> => {
          await expect(
            accountingService.createWithdrawal(withdrawal)
          ).resolves.toBeUndefined()
        }
      )

      test('A withdrawal can be committed', async (): Promise<void> => {
        await expect(
          accountingService.commitWithdrawal(withdrawal.id)
        ).resolves.toBeUndefined()
        if (withdrawal.accountId) {
          await expect(
            accountingService.getBalance(withdrawal.accountId)
          ).resolves.toEqual(startingBalance - withdrawal.amount)
        } else {
          await expect(
            accountingService.getAssetLiquidityBalance(unit)
          ).resolves.toEqual(startingBalance - withdrawal.amount)
        }
        await expect(
          accountingService.getAssetSettlementBalance(unit)
        ).resolves.toEqual(startingBalance - withdrawal.amount)
      })

      test('Cannot commit unknown withdrawal', async (): Promise<void> => {
        await expect(
          accountingService.commitWithdrawal(uuid())
        ).resolves.toEqual(TransferError.UnknownTransfer)
      })

      test('Cannot commit invalid withdrawal id', async (): Promise<void> => {
        await expect(
          accountingService.commitWithdrawal('not a uuid')
        ).resolves.toEqual(TransferError.InvalidId)
      })

      test('Cannot commit committed withdrawal', async (): Promise<void> => {
        await expect(
          accountingService.commitWithdrawal(withdrawal.id)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.commitWithdrawal(withdrawal.id)
        ).resolves.toEqual(TransferError.AlreadyCommitted)
      })

      test('Cannot commit rolled back withdrawal', async (): Promise<void> => {
        await expect(
          accountingService.rollbackWithdrawal(withdrawal.id)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.commitWithdrawal(withdrawal.id)
        ).resolves.toEqual(TransferError.AlreadyRolledBack)
      })

      test('Cannot commit expired withdrawal', async (): Promise<void> => {
        const expiringWithdrawal = {
          ...withdrawal,
          id: uuid(),
          timeout: BigInt(1) // nano-second
        }
        await expect(
          accountingService.createWithdrawal(expiringWithdrawal)
        ).resolves.toBeUndefined()
        await new Promise((resolve) => setImmediate(resolve))
        await expect(
          accountingService.commitWithdrawal(expiringWithdrawal.id)
        ).resolves.toEqual(TransferError.TransferExpired)
      })
    })

    describe('Rollback', (): void => {
      beforeEach(
        async (): Promise<void> => {
          await expect(
            accountingService.createWithdrawal(withdrawal)
          ).resolves.toBeUndefined()
        }
      )

      test('A withdrawal can be rolled back', async (): Promise<void> => {
        await expect(
          accountingService.rollbackWithdrawal(withdrawal.id)
        ).resolves.toBeUndefined()
        if (withdrawal.accountId) {
          await expect(
            accountingService.getBalance(withdrawal.accountId)
          ).resolves.toEqual(startingBalance)
        } else {
          await expect(
            accountingService.getAssetLiquidityBalance(unit)
          ).resolves.toEqual(startingBalance)
        }
        await expect(
          accountingService.getAssetSettlementBalance(unit)
        ).resolves.toEqual(startingBalance)
      })

      test('Cannot rollback unknown withdrawal', async (): Promise<void> => {
        await expect(
          accountingService.rollbackWithdrawal(uuid())
        ).resolves.toEqual(TransferError.UnknownTransfer)
      })

      test('Cannot commit invalid withdrawal id', async (): Promise<void> => {
        await expect(
          accountingService.rollbackWithdrawal('not a uuid')
        ).resolves.toEqual(TransferError.InvalidId)
      })

      test('Cannot rollback committed withdrawal', async (): Promise<void> => {
        await expect(
          accountingService.commitWithdrawal(withdrawal.id)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.rollbackWithdrawal(withdrawal.id)
        ).resolves.toEqual(TransferError.AlreadyCommitted)
      })

      test('Cannot rollback rolled back withdrawal', async (): Promise<void> => {
        await expect(
          accountingService.rollbackWithdrawal(withdrawal.id)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.rollbackWithdrawal(withdrawal.id)
        ).resolves.toEqual(TransferError.AlreadyRolledBack)
      })

      test('Cannot rollback expired withdrawal', async (): Promise<void> => {
        const expiringWithdrawal = {
          ...withdrawal,
          id: uuid(),
          timeout: BigInt(1) // nano-second
        }
        await expect(
          accountingService.createWithdrawal(expiringWithdrawal)
        ).resolves.toBeUndefined()
        await new Promise((resolve) => setImmediate(resolve))
        await expect(
          accountingService.rollbackWithdrawal(expiringWithdrawal.id)
        ).resolves.toEqual(TransferError.TransferExpired)
      })
    })
  })
})
