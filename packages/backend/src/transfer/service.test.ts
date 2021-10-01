import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { TransferService, TwoPhaseTransfer } from './service'
import { TransferError } from './errors'
import { BalanceService } from '../balance/service'
import { createTestApp, TestContainer } from '../tests/app'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'

describe('Transfer Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let transferService: TransferService
  let balanceService: BalanceService
  let sourceBalanceId: string
  let destinationBalanceId: string
  const startingSourceBalance = BigInt(100)
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
    }
  )

  beforeEach(
    async (): Promise<void> => {
      transferService = await deps.use('transferService')
      balanceService = await deps.use('balanceService')
      sourceBalanceId = uuid()
      destinationBalanceId = uuid()
      const settlementBalanceId = uuid()
      await expect(
        balanceService.create([
          {
            id: sourceBalanceId,
            unit: 1
          },
          {
            id: destinationBalanceId,
            unit: 1
          },
          {
            id: settlementBalanceId,
            unit: 1,
            debitBalance: true
          }
        ])
      ).resolves.toBeUndefined()
      await expect(
        transferService.create([
          {
            sourceBalanceId: settlementBalanceId,
            destinationBalanceId: sourceBalanceId,
            amount: startingSourceBalance
          }
        ])
      ).resolves.toBeUndefined()
      await expect(
        balanceService.get([sourceBalanceId, destinationBalanceId])
      ).resolves.toMatchObject([
        {
          id: sourceBalanceId,
          balance: startingSourceBalance
        },
        {
          id: destinationBalanceId,
          balance: BigInt(0)
        }
      ])
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(appContainer.knex)
      await appContainer.shutdown()
      await workerUtils.release()
    }
  )

  describe('Create', (): void => {
    test('A transfer can be created', async (): Promise<void> => {
      const transfer = {
        id: uuid(),
        sourceBalanceId,
        destinationBalanceId,
        amount: BigInt(10),
        timeout
      }
      await expect(transferService.create([transfer])).resolves.toBeUndefined()
      await expect(
        balanceService.get([sourceBalanceId, destinationBalanceId])
      ).resolves.toMatchObject([
        {
          id: sourceBalanceId,
          balance: startingSourceBalance - transfer.amount
        },
        {
          id: destinationBalanceId,
          balance: BigInt(0)
        }
      ])
    })

    test('A transfer can be auto-committed', async (): Promise<void> => {
      const transfer = {
        sourceBalanceId,
        destinationBalanceId,
        amount: BigInt(10)
      }
      await expect(transferService.create([transfer])).resolves.toBeUndefined()
      await expect(
        balanceService.get([sourceBalanceId, destinationBalanceId])
      ).resolves.toMatchObject([
        {
          id: sourceBalanceId,
          balance: startingSourceBalance - transfer.amount
        },
        {
          id: destinationBalanceId,
          balance: transfer.amount
        }
      ])
    })

    test('Cannot create duplicate transfer', async (): Promise<void> => {
      const transfer = {
        id: uuid(),
        sourceBalanceId,
        destinationBalanceId,
        amount: BigInt(10)
      }
      await expect(transferService.create([transfer])).resolves.toBeUndefined()

      await expect(transferService.create([transfer])).resolves.toEqual({
        index: 0,
        error: TransferError.TransferExists
      })

      await expect(
        transferService.create([
          {
            id: transfer.id,
            sourceBalanceId: destinationBalanceId,
            destinationBalanceId: sourceBalanceId,
            amount: BigInt(5)
          }
        ])
      ).resolves.toEqual({
        index: 0,
        error: TransferError.TransferExists
      })
    })

    test('Cannot transfer to same balance', async (): Promise<void> => {
      const transfer = {
        sourceBalanceId,
        destinationBalanceId: sourceBalanceId,
        amount: BigInt(10)
      }
      await expect(transferService.create([transfer])).resolves.toEqual({
        index: 0,
        error: TransferError.SameBalances
      })
    })

    test('Cannot transfer from unknown balance', async (): Promise<void> => {
      const transfer = {
        sourceBalanceId: uuid(),
        destinationBalanceId,
        amount: BigInt(10)
      }
      await expect(transferService.create([transfer])).resolves.toEqual({
        index: 0,
        error: TransferError.UnknownSourceBalance
      })
    })

    test('Cannot transfer to unknown balance', async (): Promise<void> => {
      const transfer = {
        sourceBalanceId,
        destinationBalanceId: uuid(),
        amount: BigInt(10)
      }
      await expect(transferService.create([transfer])).resolves.toEqual({
        index: 0,
        error: TransferError.UnknownDestinationBalance
      })
    })

    test('Cannot transfer zero', async (): Promise<void> => {
      const transfer = {
        sourceBalanceId,
        destinationBalanceId: sourceBalanceId,
        amount: BigInt(0)
      }
      await expect(transferService.create([transfer])).resolves.toEqual({
        index: 0,
        error: TransferError.InvalidAmount
      })
    })

    test('Cannot transfer negative amount', async (): Promise<void> => {
      const transfer = {
        sourceBalanceId,
        destinationBalanceId: sourceBalanceId,
        amount: -BigInt(10)
      }
      await expect(transferService.create([transfer])).resolves.toEqual({
        index: 0,
        error: TransferError.InvalidAmount
      })
    })

    test('Cannot transfer between balances with different assets', async (): Promise<void> => {
      const destinationBalanceId = uuid()
      await expect(
        balanceService.create([
          {
            id: destinationBalanceId,
            unit: 2
          }
        ])
      ).resolves.toBeUndefined()

      const transfer = {
        sourceBalanceId,
        destinationBalanceId,
        amount: BigInt(10)
      }
      await expect(transferService.create([transfer])).resolves.toEqual({
        index: 0,
        error: TransferError.DifferentAssets
      })
    })

    test('Cannot create transfer exceeding source balance', async (): Promise<void> => {
      const transfer = {
        id: uuid(),
        sourceBalanceId,
        destinationBalanceId,
        amount: startingSourceBalance + BigInt(1),
        timeout
      }
      await expect(transferService.create([transfer])).resolves.toEqual({
        index: 0,
        error: TransferError.InsufficientBalance
      })
    })

    test('Cannot create transfer exceeding debit destination balance', async (): Promise<void> => {
      const debitBalanceId = uuid()
      await expect(
        balanceService.create([
          {
            id: debitBalanceId,
            unit: 1,
            debitBalance: true
          }
        ])
      ).resolves.toBeUndefined()
      const transfer = {
        id: uuid(),
        sourceBalanceId,
        destinationBalanceId: debitBalanceId,
        amount: BigInt(10),
        timeout
      }
      await expect(transferService.create([transfer])).resolves.toEqual({
        index: 0,
        error: TransferError.InsufficientDebitBalance
      })
    })

    test('Can create multiple transfers that all succeed or fail', async (): Promise<void> => {
      const transfer = {
        sourceBalanceId,
        destinationBalanceId,
        amount: BigInt(10)
      }

      await expect(
        transferService.create([transfer, transfer])
      ).resolves.toBeUndefined()
      await expect(
        balanceService.get([sourceBalanceId, destinationBalanceId])
      ).resolves.toMatchObject([
        {
          id: sourceBalanceId,
          balance: startingSourceBalance - transfer.amount - transfer.amount
        },
        {
          id: destinationBalanceId,
          balance: transfer.amount + transfer.amount
        }
      ])

      await expect(
        transferService.create([
          transfer,
          {
            ...transfer,
            destinationBalanceId: sourceBalanceId
          }
        ])
      ).resolves.toEqual({
        index: 1,
        error: TransferError.SameBalances
      })
      await expect(
        balanceService.get([sourceBalanceId, destinationBalanceId])
      ).resolves.toMatchObject([
        {
          id: sourceBalanceId,
          balance: startingSourceBalance - transfer.amount - transfer.amount
        },
        {
          id: destinationBalanceId,
          balance: transfer.amount + transfer.amount
        }
      ])
    })
  })

  describe('Commit/Rollback', (): void => {
    let transfer: TwoPhaseTransfer

    beforeEach(
      async (): Promise<void> => {
        transfer = {
          id: uuid(),
          sourceBalanceId,
          destinationBalanceId,
          amount: BigInt(10),
          timeout
        }
        await expect(
          transferService.create([transfer])
        ).resolves.toBeUndefined()
        await expect(
          balanceService.get([sourceBalanceId, destinationBalanceId])
        ).resolves.toMatchObject([
          {
            id: sourceBalanceId,
            balance: startingSourceBalance - transfer.amount
          },
          {
            id: destinationBalanceId,
            balance: BigInt(0)
          }
        ])
      }
    )

    describe('Commit', (): void => {
      test('A transfer can be committed', async (): Promise<void> => {
        await expect(
          transferService.commit([transfer.id])
        ).resolves.toBeUndefined()
        await expect(
          balanceService.get([sourceBalanceId, destinationBalanceId])
        ).resolves.toMatchObject([
          {
            id: sourceBalanceId,
            balance: startingSourceBalance - transfer.amount
          },
          {
            id: destinationBalanceId,
            balance: transfer.amount
          }
        ])
      })

      test('Cannot commit unknown transfer', async (): Promise<void> => {
        await expect(transferService.commit([uuid()])).resolves.toEqual({
          index: 0,
          error: TransferError.UnknownTransfer
        })
      })

      test('Cannot commit committed transfer', async (): Promise<void> => {
        await expect(
          transferService.commit([transfer.id])
        ).resolves.toBeUndefined()
        await expect(transferService.commit([transfer.id])).resolves.toEqual({
          index: 0,
          error: TransferError.AlreadyCommitted
        })
      })

      test('Cannot commit rolled back transfer', async (): Promise<void> => {
        await expect(
          transferService.rollback([transfer.id])
        ).resolves.toBeUndefined()
        await expect(transferService.commit([transfer.id])).resolves.toEqual({
          index: 0,
          error: TransferError.AlreadyRolledBack
        })
      })

      test('Cannot commit auto-committed transfer', async (): Promise<void> => {
        const transfer = {
          id: uuid(),
          sourceBalanceId,
          destinationBalanceId,
          amount: BigInt(10)
        }
        await expect(
          transferService.create([transfer])
        ).resolves.toBeUndefined()
        await expect(transferService.commit([transfer.id])).resolves.toEqual({
          index: 0,
          error: TransferError.AlreadyCommitted
        })
      })

      test('Cannot commit expired transfer', async (): Promise<void> => {
        const transfer = {
          id: uuid(),
          sourceBalanceId,
          destinationBalanceId,
          amount: BigInt(10),
          timeout: BigInt(1) // nano-second
        }
        await expect(
          transferService.create([transfer])
        ).resolves.toBeUndefined()
        await new Promise((resolve) => setImmediate(resolve))
        await expect(transferService.commit([transfer.id])).resolves.toEqual({
          index: 0,
          error: TransferError.TransferExpired
        })
      })

      test('Can commit multiple transfers that all succeed or fail', async (): Promise<void> => {
        {
          const transferId = uuid()
          await expect(
            transferService.create([
              {
                ...transfer,
                id: transferId
              }
            ])
          ).resolves.toBeUndefined()
          await expect(
            transferService.commit([transfer.id, transferId])
          ).resolves.toBeUndefined()
          await expect(
            balanceService.get([sourceBalanceId, destinationBalanceId])
          ).resolves.toMatchObject([
            {
              id: sourceBalanceId,
              balance: startingSourceBalance - transfer.amount - transfer.amount
            },
            {
              id: destinationBalanceId,
              balance: transfer.amount + transfer.amount
            }
          ])
        }
        {
          const transferId = uuid()
          await expect(
            transferService.create([
              {
                ...transfer,
                id: transferId
              }
            ])
          ).resolves.toBeUndefined()
          await expect(
            transferService.commit([transfer.id, transferId])
          ).resolves.toEqual({
            index: 0,
            error: TransferError.AlreadyCommitted
          })
          await expect(
            balanceService.get([sourceBalanceId, destinationBalanceId])
          ).resolves.toMatchObject([
            {
              id: sourceBalanceId,
              balance:
                startingSourceBalance -
                transfer.amount -
                transfer.amount -
                transfer.amount
            },
            {
              id: destinationBalanceId,
              balance: transfer.amount + transfer.amount
            }
          ])
        }
      })
    })

    describe('Rollback', (): void => {
      test('A transfer can be rolled back', async (): Promise<void> => {
        await expect(
          transferService.rollback([transfer.id])
        ).resolves.toBeUndefined()
        await expect(
          balanceService.get([sourceBalanceId, destinationBalanceId])
        ).resolves.toMatchObject([
          {
            id: sourceBalanceId,
            balance: startingSourceBalance
          },
          {
            id: destinationBalanceId,
            balance: BigInt(0)
          }
        ])
      })

      test('Cannot rollback unknown transfer', async (): Promise<void> => {
        await expect(transferService.rollback([uuid()])).resolves.toEqual({
          index: 0,
          error: TransferError.UnknownTransfer
        })
      })

      test('Cannot rollback committed transfer', async (): Promise<void> => {
        await expect(
          transferService.commit([transfer.id])
        ).resolves.toBeUndefined()
        await expect(transferService.rollback([transfer.id])).resolves.toEqual({
          index: 0,
          error: TransferError.AlreadyCommitted
        })
      })

      test('Cannot rollback rolled back transfer', async (): Promise<void> => {
        await expect(
          transferService.rollback([transfer.id])
        ).resolves.toBeUndefined()
        await expect(transferService.rollback([transfer.id])).resolves.toEqual({
          index: 0,
          error: TransferError.AlreadyRolledBack
        })
      })

      test('Cannot rollback auto-committed transfer', async (): Promise<void> => {
        const transfer = {
          id: uuid(),
          sourceBalanceId,
          destinationBalanceId,
          amount: BigInt(10)
        }
        await expect(
          transferService.create([transfer])
        ).resolves.toBeUndefined()
        await expect(transferService.rollback([transfer.id])).resolves.toEqual({
          index: 0,
          error: TransferError.AlreadyCommitted
        })
      })

      test('Cannot rollback expired transfer', async (): Promise<void> => {
        const transfer = {
          id: uuid(),
          sourceBalanceId,
          destinationBalanceId,
          amount: BigInt(10),
          timeout: BigInt(1) // nano-second
        }
        await expect(
          transferService.create([transfer])
        ).resolves.toBeUndefined()
        await new Promise((resolve) => setImmediate(resolve))
        await expect(transferService.rollback([transfer.id])).resolves.toEqual({
          index: 0,
          error: TransferError.TransferExpired
        })
      })

      test('Can rollback multiple transfers that all succeed or fail', async (): Promise<void> => {
        {
          const transferId = uuid()
          await expect(
            transferService.create([
              {
                ...transfer,
                id: transferId
              }
            ])
          ).resolves.toBeUndefined()
          await expect(
            transferService.rollback([transfer.id, transferId])
          ).resolves.toBeUndefined()
          await expect(
            balanceService.get([sourceBalanceId, destinationBalanceId])
          ).resolves.toMatchObject([
            {
              id: sourceBalanceId,
              balance: startingSourceBalance
            },
            {
              id: destinationBalanceId,
              balance: BigInt(0)
            }
          ])
        }
        {
          const transferId = uuid()
          await expect(
            transferService.create([
              {
                ...transfer,
                id: transferId
              }
            ])
          ).resolves.toBeUndefined()
          await expect(
            transferService.rollback([transfer.id, transferId])
          ).resolves.toEqual({
            index: 0,
            error: TransferError.AlreadyRolledBack
          })
          await expect(
            balanceService.get([sourceBalanceId, destinationBalanceId])
          ).resolves.toMatchObject([
            {
              id: sourceBalanceId,
              balance: startingSourceBalance - transfer.amount
            },
            {
              id: destinationBalanceId,
              balance: BigInt(0)
            }
          ])
        }
      })
    })
  })
})
