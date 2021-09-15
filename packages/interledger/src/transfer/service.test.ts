import { Model } from 'objection'
import { Transaction } from 'knex'
import { v4 as uuid } from 'uuid'

import { TransferService, isTransferError, TransferError } from './service'
import { AssetService } from '../asset/service'
import { DepositService } from '../deposit/service'
import { AccountsService } from '../accounts/service'
import {
  AccountFactory,
  createTestServices,
  TestServices,
  randomAsset
} from '../testsHelpers'

describe('Transfer Service', (): void => {
  let transferService: TransferService
  let accountsService: AccountsService
  let accountFactory: AccountFactory
  let assetService: AssetService
  let depositService: DepositService
  let services: TestServices
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      services = await createTestServices()
      ;({
        transferService,
        accountsService,
        assetService,
        depositService
      } = services)
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
        const { id: sourceAccountId, asset } = await accountFactory.build()
        const { id: destinationAccountId } = await accountFactory.build({
          asset
        })

        const startingSourceBalance = BigInt(10)
        await depositService.create({
          accountId: sourceAccountId,
          amount: startingSourceBalance
        })

        const startingLiquidity = BigInt(100)
        await depositService.createLiquidity({
          asset,
          amount: startingLiquidity
        })

        const sourceAmount = BigInt(srcAmt)
        const trxOrError = await transferService.create({
          sourceAccountId,
          destinationAccountId,
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
          accountsService.getAccountBalance(sourceAccountId)
        ).resolves.toMatchObject({
          balance: startingSourceBalance - sourceAmount
        })

        await expect(assetService.getLiquidityBalance(asset)).resolves.toEqual(
          sourceAmount < destinationAmount
            ? startingLiquidity - amountDiff
            : startingLiquidity
        )

        await expect(
          accountsService.getAccountBalance(destinationAccountId)
        ).resolves.toMatchObject({
          balance: BigInt(0)
        })

        if (accept) {
          await expect(trxOrError.commit()).resolves.toBeUndefined()
        } else {
          await expect(trxOrError.rollback()).resolves.toBeUndefined()
        }

        await expect(
          accountsService.getAccountBalance(sourceAccountId)
        ).resolves.toMatchObject({
          balance: accept
            ? startingSourceBalance - sourceAmount
            : startingSourceBalance
        })

        await expect(assetService.getLiquidityBalance(asset)).resolves.toEqual(
          accept ? startingLiquidity - amountDiff : startingLiquidity
        )

        await expect(
          accountsService.getAccountBalance(destinationAccountId)
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
        const {
          id: sourceAccountId,
          asset: sourceAsset
        } = await accountFactory.build({
          asset: {
            code: randomAsset().code,
            scale: 10
          }
        })
        const {
          id: destinationAccountId,
          asset: destinationAsset
        } = await accountFactory.build({
          asset: {
            code: sameCode ? sourceAsset.code : randomAsset().code,
            scale: sourceAsset.scale + 2
          }
        })

        const startingSourceBalance = BigInt(10)
        await depositService.create({
          accountId: sourceAccountId,
          amount: startingSourceBalance
        })

        const startingDestinationLiquidity = BigInt(100)
        await depositService.createLiquidity({
          asset: destinationAsset,
          amount: startingDestinationLiquidity
        })

        const sourceAmount = BigInt(1)
        const destinationAmount = BigInt(2)
        const trxOrError = await transferService.create({
          sourceAccountId,
          destinationAccountId,
          sourceAmount,
          destinationAmount
        })
        expect(isTransferError(trxOrError)).toEqual(false)
        if (isTransferError(trxOrError)) {
          fail()
        }

        await expect(
          accountsService.getAccountBalance(sourceAccountId)
        ).resolves.toMatchObject({
          balance: startingSourceBalance - sourceAmount
        })

        await expect(
          assetService.getLiquidityBalance(sourceAsset)
        ).resolves.toEqual(BigInt(0))

        await expect(
          assetService.getLiquidityBalance(destinationAsset)
        ).resolves.toEqual(startingDestinationLiquidity - destinationAmount)

        await expect(
          accountsService.getAccountBalance(destinationAccountId)
        ).resolves.toMatchObject({
          balance: BigInt(0)
        })

        if (accept) {
          await expect(trxOrError.commit()).resolves.toBeUndefined()
        } else {
          await expect(trxOrError.rollback()).resolves.toBeUndefined()
        }

        await expect(
          accountsService.getAccountBalance(sourceAccountId)
        ).resolves.toMatchObject({
          balance: accept
            ? startingSourceBalance - sourceAmount
            : startingSourceBalance
        })

        await expect(
          assetService.getLiquidityBalance(sourceAsset)
        ).resolves.toEqual(accept ? sourceAmount : BigInt(0))

        await expect(
          assetService.getLiquidityBalance(destinationAsset)
        ).resolves.toEqual(
          accept
            ? startingDestinationLiquidity - destinationAmount
            : startingDestinationLiquidity
        )

        await expect(
          accountsService.getAccountBalance(destinationAccountId)
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
      const { id: sourceAccountId, asset } = await accountFactory.build()
      const { id: destinationAccountId } = await accountFactory.build({
        asset
      })
      const transfer = {
        sourceAccountId,
        destinationAccountId,
        sourceAmount: BigInt(5)
      }
      await expect(transferService.create(transfer)).resolves.toEqual(
        TransferError.InsufficientBalance
      )
      await expect(
        accountsService.getAccountBalance(sourceAccountId)
      ).resolves.toMatchObject({ balance: BigInt(0) })
      await expect(
        accountsService.getAccountBalance(destinationAccountId)
      ).resolves.toMatchObject({ balance: BigInt(0) })
    })

    test.each`
      sameAsset
      ${true}
      ${false}
    `(
      'Returns error for insufficient destination liquidity balance { sameAsset: $sameAsset }',
      async ({ sameAsset }): Promise<void> => {
        const {
          id: sourceAccountId,
          asset: sourceAsset
        } = await accountFactory.build()
        const {
          id: destinationAccountId,
          asset: destinationAsset
        } = await accountFactory.build({
          asset: sameAsset ? sourceAsset : randomAsset()
        })
        const startingSourceBalance = BigInt(10)
        await depositService.create({
          accountId: sourceAccountId,
          amount: startingSourceBalance
        })
        const sourceAmount = BigInt(5)
        const destinationAmount = BigInt(10)
        const transfer = {
          sourceAccountId,
          destinationAccountId,
          sourceAmount,
          destinationAmount
        }

        await expect(transferService.create(transfer)).resolves.toEqual(
          TransferError.InsufficientLiquidity
        )

        await expect(
          accountsService.getAccountBalance(sourceAccountId)
        ).resolves.toMatchObject({
          balance: startingSourceBalance
        })

        await expect(
          assetService.getLiquidityBalance(sourceAsset)
        ).resolves.toEqual(BigInt(0))

        await expect(
          assetService.getLiquidityBalance(destinationAsset)
        ).resolves.toEqual(BigInt(0))

        await expect(
          accountsService.getAccountBalance(destinationAccountId)
        ).resolves.toMatchObject({
          balance: BigInt(0)
        })
      }
    )

    test('Returns error for nonexistent account', async (): Promise<void> => {
      await expect(
        transferService.create({
          sourceAccountId: uuid(),
          destinationAccountId: uuid(),
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.UnknownSourceAccount)

      const { id } = await accountFactory.build()

      const unknownAccountId = uuid()
      await expect(
        transferService.create({
          sourceAccountId: id,
          destinationAccountId: unknownAccountId,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.UnknownDestinationAccount)

      await expect(
        transferService.create({
          sourceAccountId: unknownAccountId,
          destinationAccountId: id,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.UnknownSourceAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id } = await accountFactory.build()

      await expect(
        transferService.create({
          sourceAccountId: id,
          destinationAccountId: id,
          sourceAmount: BigInt(5)
        })
      ).resolves.toEqual(TransferError.SameAccounts)
    })

    test('Returns error for invalid source amount', async (): Promise<void> => {
      const { id: sourceAccountId, asset } = await accountFactory.build()
      const { id: destinationAccountId } = await accountFactory.build({
        asset
      })
      const startingSourceBalance = BigInt(10)
      await depositService.create({
        accountId: sourceAccountId,
        amount: startingSourceBalance
      })

      await expect(
        transferService.create({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(0)
        })
      ).resolves.toEqual(TransferError.InvalidSourceAmount)

      await expect(
        transferService.create({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(-1)
        })
      ).resolves.toEqual(TransferError.InvalidSourceAmount)
    })

    test('Returns error for invalid destination amount', async (): Promise<void> => {
      const { id: sourceAccountId } = await accountFactory.build()
      const { id: destinationAccountId } = await accountFactory.build()
      const startingSourceBalance = BigInt(10)
      await depositService.create({
        accountId: sourceAccountId,
        amount: startingSourceBalance
      })

      await expect(
        transferService.create({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(0)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)

      await expect(
        transferService.create({
          sourceAccountId,
          destinationAccountId,
          sourceAmount: BigInt(5),
          destinationAmount: BigInt(-1)
        })
      ).resolves.toEqual(TransferError.InvalidDestinationAmount)
    })

    test('Returns error for missing destination amount', async (): Promise<void> => {
      const {
        id: sourceAccountId,
        asset: sourceAsset
      } = await accountFactory.build({
        asset: {
          code: randomAsset().code,
          scale: 10
        }
      })
      const startingSourceBalance = BigInt(10)
      await depositService.create({
        accountId: sourceAccountId,
        amount: startingSourceBalance
      })

      {
        const { id: destinationAccountId } = await accountFactory.build({
          asset: {
            code: sourceAsset.code,
            scale: sourceAsset.scale + 1
          }
        })
        await expect(
          transferService.create({
            sourceAccountId,
            destinationAccountId,
            sourceAmount: BigInt(5)
          })
        ).resolves.toEqual(TransferError.InvalidDestinationAmount)
      }

      {
        const { id: destinationAccountId } = await accountFactory.build()
        await expect(
          transferService.create({
            sourceAccountId,
            destinationAccountId,
            sourceAmount: BigInt(5)
          })
        ).resolves.toEqual(TransferError.InvalidDestinationAmount)
      }
    })

    test.todo('Returns error timed out transfer')
  })
})
