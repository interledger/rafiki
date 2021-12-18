import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { CreateAccountError as CreateTbAccountError } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import {
  Account,
  AccountingService,
  AccountOptions,
  AssetAccount,
  TwoPhaseTransfer
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
import { AccountFactory } from '../tests/accountFactory'
import { randomUnit } from '../tests/asset'

describe('Accounting Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let accountingService: AccountingService
  let accountFactory: AccountFactory
  const timeout = BigInt(10e9) // 10 seconds
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  async function addAssetLiquidity(
    unit: number,
    amount: bigint
  ): Promise<void> {
    await expect(
      accountingService.createTransfer({
        sourceAccount: {
          asset: {
            unit,
            account: AssetAccount.Settlement
          }
        },
        destinationAccount: {
          asset: {
            unit,
            account: AssetAccount.Liquidity
          }
        },
        amount
      })
    ).resolves.toBeUndefined()
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
      accountingService = await deps.use('accountingService')
      accountFactory = new AccountFactory(accountingService)
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
      const options: AccountOptions = {
        id: uuid(),
        asset: {
          unit: randomUnit()
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
            unit: randomUnit()
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
            unit: randomUnit()
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
      const unit = randomUnit()

      for (const account in AssetAccount) {
        if (typeof account === 'number') {
          await expect(
            accountingService.getAssetAccountBalance(unit, account)
          ).resolves.toBeUndefined()
        }
      }

      await accountingService.createAssetAccounts(unit)

      for (const account in AssetAccount) {
        if (typeof account === 'number') {
          await expect(
            accountingService.getAssetAccountBalance(unit, account)
          ).resolves.toEqual(BigInt(0))
        }
      }
    })
  })

  describe('Get Asset Account Balance', (): void => {
    test("Can retrieve an asset accounts' balance", async (): Promise<void> => {
      const unit = randomUnit()
      await accountingService.createAssetAccounts(unit)
      for (const account in AssetAccount) {
        if (typeof account === 'number') {
          await expect(
            accountingService.getAssetAccountBalance(unit, account)
          ).resolves.toEqual(BigInt(0))
        }
      }
    })

    test('Returns undefined for nonexistent account', async (): Promise<void> => {
      await expect(
        accountingService.getAssetAccountBalance(
          randomUnit(),
          AssetAccount.Liquidity
        )
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
          await addAssetLiquidity(
            destinationAccount.asset.unit,
            startingDestinationLiquidity
          )
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
            const trxOrError = await accountingService.transferFunds({
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
                accountingService.getAssetAccountBalance(
                  sourceAccount.asset.unit,
                  AssetAccount.Liquidity
                )
              ).resolves.toEqual(
                sourceAmount < destinationAmount
                  ? startingDestinationLiquidity - amountDiff
                  : startingDestinationLiquidity
              )
            } else {
              await expect(
                accountingService.getAssetAccountBalance(
                  sourceAccount.asset.unit,
                  AssetAccount.Liquidity
                )
              ).resolves.toEqual(BigInt(0))

              await expect(
                accountingService.getAssetAccountBalance(
                  destinationAccount.asset.unit,
                  AssetAccount.Liquidity
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
                accountingService.getAssetAccountBalance(
                  sourceAccount.asset.unit,
                  AssetAccount.Liquidity
                )
              ).resolves.toEqual(
                commit
                  ? startingDestinationLiquidity - amountDiff
                  : startingDestinationLiquidity
              )
            } else {
              await expect(
                accountingService.getAssetAccountBalance(
                  sourceAccount.asset.unit,
                  AssetAccount.Liquidity
                )
              ).resolves.toEqual(commit ? sourceAmount : BigInt(0))

              await expect(
                accountingService.getAssetAccountBalance(
                  destinationAccount.asset.unit,
                  AssetAccount.Liquidity
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
          accountingService.transferFunds(transfer)
        ).resolves.toEqual(TransferError.InsufficientBalance)
        await expect(
          accountingService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance)
      })

      test('Returns error for insufficient destination liquidity balance', async (): Promise<void> => {
        await expect(
          accountingService.transferFunds({
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
          accountingService.transferFunds({
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
          accountingService.transferFunds({
            sourceAccount,
            destinationAccount,
            sourceAmount: BigInt(0),
            destinationAmount: BigInt(1),
            timeout
          })
        ).resolves.toEqual(TransferError.InvalidSourceAmount)

        await expect(
          accountingService.transferFunds({
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
          accountingService.transferFunds({
            sourceAccount,
            destinationAccount,
            sourceAmount: BigInt(5),
            destinationAmount: BigInt(0),
            timeout
          })
        ).resolves.toEqual(TransferError.InvalidDestinationAmount)

        await expect(
          accountingService.transferFunds({
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

  describe('Create Transfer', (): void => {
    let sourceAccount: AccountOptions
    let destinationAccount: AccountOptions
    const startingSourceBalance = BigInt(100)

    beforeEach(
      async (): Promise<void> => {
        sourceAccount = await accountFactory.build({
          balance: startingSourceBalance
        })
        destinationAccount = await accountFactory.build({
          asset: sourceAccount.asset
        })
      }
    )

    test('A transfer can be created', async (): Promise<void> => {
      const transfer = {
        id: uuid(),
        sourceAccount,
        destinationAccount,
        amount: BigInt(10),
        timeout
      }
      await expect(
        accountingService.createTransfer(transfer)
      ).resolves.toBeUndefined()
      await expect(
        accountingService.getBalance(sourceAccount.id)
      ).resolves.toEqual(startingSourceBalance - transfer.amount)
      await expect(
        accountingService.getBalance(destinationAccount.id)
      ).resolves.toEqual(BigInt(0))
    })

    test('A transfer can be auto-committed', async (): Promise<void> => {
      const transfer = {
        sourceAccount,
        destinationAccount,
        amount: BigInt(10)
      }
      await expect(
        accountingService.createTransfer(transfer)
      ).resolves.toBeUndefined()
      await expect(
        accountingService.getBalance(sourceAccount.id)
      ).resolves.toEqual(startingSourceBalance - transfer.amount)
      await expect(
        accountingService.getBalance(destinationAccount.id)
      ).resolves.toEqual(transfer.amount)
    })

    test('Cannot create transfer with invalid id', async (): Promise<void> => {
      await expect(
        accountingService.createTransfer({
          id: 'not a uuid',
          sourceAccount,
          destinationAccount,
          amount: BigInt(10)
        })
      ).resolves.toEqual(TransferError.InvalidId)
    })

    test('Cannot create duplicate transfer', async (): Promise<void> => {
      const transfer = {
        id: uuid(),
        sourceAccount,
        destinationAccount,
        amount: BigInt(10)
      }
      await expect(
        accountingService.createTransfer(transfer)
      ).resolves.toBeUndefined()

      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.TransferExists
      )

      await expect(
        accountingService.createTransfer({
          id: transfer.id,
          sourceAccount: destinationAccount,
          destinationAccount: sourceAccount,
          amount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.TransferExists)
    })

    test('Cannot transfer to same account', async (): Promise<void> => {
      const transfer = {
        sourceAccount,
        destinationAccount: sourceAccount,
        amount: BigInt(10)
      }
      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.SameAccounts
      )
    })

    test('Cannot transfer from unknown account', async (): Promise<void> => {
      const transfer = {
        sourceAccount: {
          id: uuid()
        },
        destinationAccount,
        amount: BigInt(10)
      }
      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.UnknownSourceAccount
      )
    })

    test('Cannot transfer to unknown account', async (): Promise<void> => {
      const transfer = {
        sourceAccount,
        destinationAccount: {
          id: uuid()
        },
        amount: BigInt(10)
      }
      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.UnknownDestinationAccount
      )
    })

    test('Cannot transfer zero', async (): Promise<void> => {
      const transfer = {
        sourceAccount,
        destinationAccount: sourceAccount,
        amount: BigInt(0)
      }
      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.InvalidAmount
      )
    })

    test('Cannot transfer negative amount', async (): Promise<void> => {
      const transfer = {
        sourceAccount,
        destinationAccount: sourceAccount,
        amount: -BigInt(10)
      }
      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.InvalidAmount
      )
    })

    test('Cannot transfer between accounts with different assets', async (): Promise<void> => {
      const destinationAccount = await accountFactory.build({
        asset: {
          unit: randomUnit()
        }
      })

      const transfer = {
        sourceAccount,
        destinationAccount,
        amount: BigInt(10)
      }
      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.DifferentAssets
      )
    })

    test('Cannot create transfer exceeding source balance', async (): Promise<void> => {
      const transfer = {
        id: uuid(),
        sourceAccount,
        destinationAccount,
        amount: startingSourceBalance + BigInt(1),
        timeout
      }
      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.InsufficientBalance
      )
    })
  })

  describe('Commit/Rollback Transfer', (): void => {
    let transfer: TwoPhaseTransfer
    let sourceAccount: Account
    let destinationAccount: Account
    const startingSourceBalance = BigInt(100)

    beforeEach(
      async (): Promise<void> => {
        sourceAccount = await accountFactory.build({
          balance: startingSourceBalance
        })
        destinationAccount = await accountFactory.build({
          asset: sourceAccount.asset
        })
        transfer = {
          id: uuid(),
          sourceAccount,
          destinationAccount,
          amount: BigInt(10),
          timeout
        }
        await expect(
          accountingService.createTransfer(transfer)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance - transfer.amount)
        await expect(
          accountingService.getBalance(destinationAccount.id)
        ).resolves.toEqual(BigInt(0))
      }
    )

    describe('Commit', (): void => {
      test('A transfer can be committed', async (): Promise<void> => {
        await expect(
          accountingService.commitTransfer(transfer.id)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance - transfer.amount)
        await expect(
          accountingService.getBalance(destinationAccount.id)
        ).resolves.toEqual(transfer.amount)
      })

      test('Cannot commit unknown transfer', async (): Promise<void> => {
        await expect(accountingService.commitTransfer(uuid())).resolves.toEqual(
          TransferError.UnknownTransfer
        )
      })

      test('Cannot commit invalid transfer id', async (): Promise<void> => {
        await expect(
          accountingService.commitTransfer('not a uuid')
        ).resolves.toEqual(TransferError.InvalidId)
      })

      test('Cannot commit committed transfer', async (): Promise<void> => {
        await expect(
          accountingService.commitTransfer(transfer.id)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.commitTransfer(transfer.id)
        ).resolves.toEqual(TransferError.AlreadyCommitted)
      })

      test('Cannot commit rolled back transfer', async (): Promise<void> => {
        await expect(
          accountingService.rollbackTransfer(transfer.id)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.commitTransfer(transfer.id)
        ).resolves.toEqual(TransferError.AlreadyRolledBack)
      })

      test('Cannot commit auto-committed transfer', async (): Promise<void> => {
        const transfer = {
          id: uuid(),
          sourceAccount,
          destinationAccount,
          amount: BigInt(10)
        }
        await expect(
          accountingService.createTransfer(transfer)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.commitTransfer(transfer.id)
        ).resolves.toEqual(TransferError.AlreadyCommitted)
      })

      test('Cannot commit expired transfer', async (): Promise<void> => {
        const transfer = {
          id: uuid(),
          sourceAccount,
          destinationAccount,
          amount: BigInt(10),
          timeout: BigInt(1) // nano-second
        }
        await expect(
          accountingService.createTransfer(transfer)
        ).resolves.toBeUndefined()
        await new Promise((resolve) => setImmediate(resolve))
        await expect(
          accountingService.commitTransfer(transfer.id)
        ).resolves.toEqual(TransferError.TransferExpired)
      })
    })

    describe('Rollback', (): void => {
      test('A transfer can be rolled back', async (): Promise<void> => {
        await expect(
          accountingService.rollbackTransfer(transfer.id)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance)
        await expect(
          accountingService.getBalance(destinationAccount.id)
        ).resolves.toEqual(BigInt(0))
      })

      test('Cannot rollback unknown transfer', async (): Promise<void> => {
        await expect(
          accountingService.rollbackTransfer(uuid())
        ).resolves.toEqual(TransferError.UnknownTransfer)
      })

      test('Cannot commit invalid transfer id', async (): Promise<void> => {
        await expect(
          accountingService.rollbackTransfer('not a uuid')
        ).resolves.toEqual(TransferError.InvalidId)
      })

      test('Cannot rollback committed transfer', async (): Promise<void> => {
        await expect(
          accountingService.commitTransfer(transfer.id)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.rollbackTransfer(transfer.id)
        ).resolves.toEqual(TransferError.AlreadyCommitted)
      })

      test('Cannot rollback rolled back transfer', async (): Promise<void> => {
        await expect(
          accountingService.rollbackTransfer(transfer.id)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.rollbackTransfer(transfer.id)
        ).resolves.toEqual(TransferError.AlreadyRolledBack)
      })

      test('Cannot rollback auto-committed transfer', async (): Promise<void> => {
        const transfer = {
          id: uuid(),
          sourceAccount,
          destinationAccount,
          amount: BigInt(10)
        }
        await expect(
          accountingService.createTransfer(transfer)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.rollbackTransfer(transfer.id)
        ).resolves.toEqual(TransferError.AlreadyCommitted)
      })

      test('Cannot rollback expired transfer', async (): Promise<void> => {
        const transfer = {
          id: uuid(),
          sourceAccount,
          destinationAccount,
          amount: BigInt(10),
          timeout: BigInt(1) // nano-second
        }
        await expect(
          accountingService.createTransfer(transfer)
        ).resolves.toBeUndefined()
        await new Promise((resolve) => setImmediate(resolve))
        await expect(
          accountingService.rollbackTransfer(transfer.id)
        ).resolves.toEqual(TransferError.TransferExpired)
      })
    })
  })
})
