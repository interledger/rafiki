import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { CreateAccountError as CreateTbAccountError } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import {
  AccountingService,
  Account,
  AccountType,
  AssetAccount,
  CreateOptions,
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
      const options: CreateOptions = {
        asset: {
          unit: randomUnit()
        },
        type: AccountType.Credit
      }
      const account = await accountingService.createAccount(options)
      expect(account).toEqual({
        id: account.id,
        ...options,
        balance: BigInt(0)
      })
      await expect(accountingService.getAccount(account.id)).resolves.toEqual(
        account
      )
    })

    test('Can create an account with specified id', async (): Promise<void> => {
      const options: CreateOptions = {
        id: uuid(),
        asset: {
          unit: randomUnit()
        },
        type: AccountType.Credit
      }
      await expect(accountingService.createAccount(options)).resolves.toEqual({
        ...options,
        balance: BigInt(0)
      })
    })

    test('Create throws on invalid id', async (): Promise<void> => {
      await expect(
        accountingService.createAccount({
          id: 'not a uuid',
          asset: {
            unit: randomUnit()
          },
          type: AccountType.Credit
        })
      ).rejects.toThrowError('unable to create account, invalid id')
    })

    test('Can create an account with a debit balance', async (): Promise<void> => {
      const options: CreateOptions = {
        asset: {
          unit: randomUnit()
        },
        type: AccountType.Debit
      }
      const account = await accountingService.createAccount(options)
      expect(account).toEqual({
        id: account.id,
        ...options,
        balance: BigInt(0)
      })
      await expect(accountingService.getAccount(account.id)).resolves.toEqual(
        account
      )
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
        accountingService.createAccount({
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

  describe('Send and Receive', (): void => {
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
            amount: startingLiquidity
          })
        ).resolves.toBeUndefined()

        const sourceAmount = BigInt(srcAmt)
        const trxOrError = await accountingService.sendAndReceive({
          sourceAccount,
          destinationAccount,
          sourceAmount,
          destinationAmount: destAmt ? BigInt(destAmt) : undefined,
          timeout
        })
        assert.ok(!isTransferError(trxOrError))
        const destinationAmount = destAmt ? BigInt(destAmt) : sourceAmount
        const amountDiff = destinationAmount - sourceAmount

        await expect(
          accountingService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance - sourceAmount)

        await expect(
          accountingService.getAssetAccountBalance(unit, AssetAccount.Liquidity)
        ).resolves.toEqual(
          sourceAmount < destinationAmount
            ? startingLiquidity - amountDiff
            : startingLiquidity
        )

        await expect(
          accountingService.getBalance(destinationAccount.id)
        ).resolves.toEqual(BigInt(0))

        if (accept) {
          await expect(trxOrError.commit()).resolves.toBeUndefined()
        } else {
          await expect(trxOrError.rollback()).resolves.toBeUndefined()
        }

        await expect(
          accountingService.getBalance(sourceAccount.id)
        ).resolves.toEqual(
          accept ? startingSourceBalance - sourceAmount : startingSourceBalance
        )

        await expect(
          accountingService.getAssetAccountBalance(unit, AssetAccount.Liquidity)
        ).resolves.toEqual(
          accept ? startingLiquidity - amountDiff : startingLiquidity
        )

        await expect(
          accountingService.getBalance(destinationAccount.id)
        ).resolves.toEqual(accept ? destinationAmount : BigInt(0))

        await expect(trxOrError.commit()).resolves.toEqual(
          accept
            ? TransferError.AlreadyCommitted
            : TransferError.AlreadyRolledBack
        )
        await expect(trxOrError.rollback()).resolves.toEqual(
          accept
            ? TransferError.AlreadyCommitted
            : TransferError.AlreadyRolledBack
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
        await expect(
          accountingService.createTransfer({
            sourceAccount: {
              asset: {
                unit: destinationAccount.asset.unit,
                account: AssetAccount.Settlement
              }
            },
            destinationAccount: {
              asset: {
                unit: destinationAccount.asset.unit,
                account: AssetAccount.Liquidity
              }
            },
            amount: startingDestinationLiquidity
          })
        ).resolves.toBeUndefined()

        const sourceAmount = BigInt(1)
        const destinationAmount = BigInt(2)
        const trxOrError = await accountingService.sendAndReceive({
          sourceAccount,
          destinationAccount,
          sourceAmount,
          destinationAmount,
          timeout
        })
        assert.ok(!isTransferError(trxOrError))

        await expect(
          accountingService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance - sourceAmount)

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
        ).resolves.toEqual(startingDestinationLiquidity - destinationAmount)

        await expect(
          accountingService.getBalance(destinationAccount.id)
        ).resolves.toEqual(BigInt(0))

        if (accept) {
          await expect(trxOrError.commit()).resolves.toBeUndefined()
        } else {
          await expect(trxOrError.rollback()).resolves.toBeUndefined()
        }

        await expect(
          accountingService.getBalance(sourceAccount.id)
        ).resolves.toEqual(
          accept ? startingSourceBalance - sourceAmount : startingSourceBalance
        )

        await expect(
          accountingService.getAssetAccountBalance(
            sourceAccount.asset.unit,
            AssetAccount.Liquidity
          )
        ).resolves.toEqual(accept ? sourceAmount : BigInt(0))

        await expect(
          accountingService.getAssetAccountBalance(
            destinationAccount.asset.unit,
            AssetAccount.Liquidity
          )
        ).resolves.toEqual(
          accept
            ? startingDestinationLiquidity - destinationAmount
            : startingDestinationLiquidity
        )

        await expect(
          accountingService.getBalance(destinationAccount.id)
        ).resolves.toEqual(accept ? destinationAmount : BigInt(0))

        await expect(trxOrError.commit()).resolves.toEqual(
          accept
            ? TransferError.AlreadyCommitted
            : TransferError.AlreadyRolledBack
        )
        await expect(trxOrError.rollback()).resolves.toEqual(
          accept
            ? TransferError.AlreadyCommitted
            : TransferError.AlreadyRolledBack
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
      await expect(accountingService.sendAndReceive(transfer)).resolves.toEqual(
        TransferError.InsufficientBalance
      )
      await expect(
        accountingService.getBalance(sourceAccount.id)
      ).resolves.toEqual(BigInt(0))
      await expect(
        accountingService.getBalance(destinationAccount.id)
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

        await expect(
          accountingService.sendAndReceive(transfer)
        ).resolves.toEqual(TransferError.InsufficientLiquidity)

        await expect(
          accountingService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance)

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
        ).resolves.toEqual(BigInt(0))

        await expect(
          accountingService.getBalance(destinationAccount.id)
        ).resolves.toEqual(BigInt(0))
      }
    )

    test('Returns error for same accounts', async (): Promise<void> => {
      const account = await accountFactory.build()

      await expect(
        accountingService.sendAndReceive({
          sourceAccount: account,
          destinationAccount: account,
          sourceAmount: BigInt(5),
          timeout
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
        accountingService.sendAndReceive({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(0),
          timeout
        })
      ).resolves.toEqual(TransferError.InvalidSourceAmount)

      await expect(
        accountingService.sendAndReceive({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(-1),
          timeout
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
        accountingService.sendAndReceive({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(0),
          timeout
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)

      await expect(
        accountingService.sendAndReceive({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(-1),
          timeout
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)
    })

    test('Returns error for missing destination amount', async (): Promise<void> => {
      const startingSourceBalance = BigInt(10)
      const sourceAccount = await accountFactory.build({
        balance: startingSourceBalance
      })

      const destinationAccount = await accountFactory.build()
      await expect(
        accountingService.sendAndReceive({
          sourceAccount,
          destinationAccount,
          sourceAmount: BigInt(5),
          timeout
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)
    })

    test('Updates sent account balance', async (): Promise<void> => {
      const startingSourceBalance = BigInt(10)
      const sourceAccount = await accountFactory.build({
        balance: startingSourceBalance
      })

      const sentAccount = await accountFactory.build({
        asset: sourceAccount.asset
      })

      const destinationAccount = await accountFactory.build({
        asset: sourceAccount.asset
      })

      const sourceAmount = BigInt(5)

      const trxOrError = await accountingService.sendAndReceive({
        sourceAccount: {
          ...sourceAccount,
          sentAccountId: sentAccount.id
        },
        destinationAccount,
        sourceAmount,
        timeout
      })
      assert.ok(!isTransferError(trxOrError))
      await expect(
        accountingService.getBalance(sentAccount.id)
      ).resolves.toEqual(BigInt(0))
      await expect(trxOrError.commit()).resolves.toBeUndefined()
      await expect(
        accountingService.getBalance(sentAccount.id)
      ).resolves.toEqual(sourceAmount)
    })

    test('Updates received account balance', async (): Promise<void> => {
      const sourceAccount = await accountFactory.build({
        balance: BigInt(10)
      })

      const destinationAccount = await accountFactory.build({
        asset: sourceAccount.asset
      })

      const receivedAccount = await accountFactory.build({
        asset: sourceAccount.asset,
        type: AccountType.Credit
      })

      const amount = BigInt(5)

      const trxOrError = await accountingService.sendAndReceive({
        sourceAccount,
        destinationAccount: {
          ...destinationAccount,
          receivedAccountId: receivedAccount.id
        },
        sourceAmount: amount,
        timeout
      })

      assert.ok(!isTransferError(trxOrError))
      await expect(
        accountingService.getBalance(receivedAccount.id)
      ).resolves.toEqual(BigInt(0))
      await expect(trxOrError.commit()).resolves.toBeUndefined()
      await expect(
        accountingService.getBalance(receivedAccount.id)
      ).resolves.toEqual(amount)
    })

    test('Cannot exceed destination receive limit', async (): Promise<void> => {
      const sourceAccount = await accountFactory.build({
        balance: BigInt(200)
      })
      const destinationAccount = await accountFactory.build({
        asset: sourceAccount.asset
      })
      const receiveLimitAccount = await accountFactory.build({
        asset: sourceAccount.asset,
        type: AccountType.Debit
      })
      const receiveLimit = BigInt(123)
      await expect(
        accountingService.createTransfer({
          sourceAccount: receiveLimitAccount,
          destinationAccount: {
            asset: {
              unit: receiveLimitAccount.asset.unit,
              account: AssetAccount.ReceiveLimit
            }
          },
          amount: receiveLimit
        })
      ).resolves.toBeUndefined()
      await expect(
        accountingService.sendAndReceive({
          sourceAccount,
          destinationAccount: {
            ...destinationAccount,
            receivedAccountId: receiveLimitAccount.id
          },
          sourceAmount: receiveLimit + BigInt(1),
          timeout
        })
      ).resolves.toEqual(TransferError.ReceiveLimitExceeded)

      // ... but a smaller payment is fine
      const trxOrError = await accountingService.sendAndReceive({
        sourceAccount,
        destinationAccount: {
          ...destinationAccount,
          receivedAccountId: receiveLimitAccount.id
        },
        sourceAmount: receiveLimit,
        timeout
      })
      expect(isTransferError(trxOrError)).toEqual(false)
    })

    test.todo('Returns error timed out transfer')
  })

  describe('Create Transfer', (): void => {
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

    test('Cannot transfer to same balance', async (): Promise<void> => {
      const transfer = {
        sourceAccount,
        destinationAccount: sourceAccount,
        amount: BigInt(10)
      }
      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.SameAccounts
      )
    })

    test('Cannot transfer from unknown balance', async (): Promise<void> => {
      const transfer = {
        sourceAccount: {
          id: uuid(),
          asset: sourceAccount.asset
        },
        destinationAccount,
        amount: BigInt(10)
      }
      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.UnknownSourceBalance
      )
    })

    test('Cannot transfer to unknown balance', async (): Promise<void> => {
      const transfer = {
        sourceAccount,
        destinationAccount: {
          id: uuid(),
          asset: destinationAccount.asset
        },
        amount: BigInt(10)
      }
      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.UnknownDestinationBalance
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
      const destinationAccount = await accountingService.createAccount({
        asset: {
          unit: randomUnit()
        },
        type: AccountType.Credit
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

    test('Cannot create transfer exceeding debit destination balance', async (): Promise<void> => {
      const debitAccount = await accountingService.createAccount({
        asset: sourceAccount.asset,
        type: AccountType.Debit
      })
      const transfer = {
        id: uuid(),
        sourceAccount,
        destinationAccount: debitAccount,
        amount: BigInt(10),
        timeout
      }
      await expect(accountingService.createTransfer(transfer)).resolves.toEqual(
        TransferError.InsufficientDebitBalance
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
