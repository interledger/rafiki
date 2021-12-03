import assert from 'assert'
import { gql } from 'apollo-server-koa'
import Knex from 'knex'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import {
  AccountingService,
  AccountOptions,
  AssetAccount
} from '../../accounting/service'
import { AssetService } from '../../asset/service'
import { AccountFactory } from '../../tests/accountFactory'
import { randomAsset, randomUnit } from '../../tests/asset'
import { PeerFactory } from '../../tests/peerFactory'
import { truncateTables } from '../../tests/tableManager'
import { LiquidityError, LiquidityMutationResponse } from '../generated/graphql'

describe('Withdrawal Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accountFactory: AccountFactory
  let accountingService: AccountingService
  let assetService: AssetService
  let peerFactory: PeerFactory
  let knex: Knex
  const timeout = BigInt(10e9) // 10 seconds

  interface LiquidityOptions {
    id?: string
    account: AccountOptions
    amount: bigint
  }

  async function addLiquidity({
    id,
    account,
    amount
  }: LiquidityOptions): Promise<void> {
    await expect(
      accountingService.createTransfer({
        id,
        sourceAccount: {
          asset: {
            unit: account.asset.unit,
            account: AssetAccount.Settlement
          }
        },
        destinationAccount: account,
        amount
      })
    ).resolves.toBeUndefined()
  }

  async function createLiquidityWithdrawal({
    id,
    account,
    amount
  }: Required<LiquidityOptions>): Promise<void> {
    await expect(
      accountingService.createTransfer({
        id,
        sourceAccount: account,
        destinationAccount: {
          asset: {
            unit: account.asset.unit,
            account: AssetAccount.Settlement
          }
        },
        amount,
        timeout
      })
    ).resolves.toBeUndefined()
  }

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      accountingService = await deps.use('accountingService')
      assetService = await deps.use('assetService')
      accountFactory = new AccountFactory(accountingService)
      const peerService = await deps.use('peerService')
      peerFactory = new PeerFactory(peerService)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await truncateTables(knex)
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  describe('Add peer liquidity', (): void => {
    let peerId: string

    beforeEach(
      async (): Promise<void> => {
        peerId = (await peerFactory.build()).id
      }
    )

    test('Can add liquidity to peer', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddPeerLiquidity($input: AddPeerLiquidityInput!) {
              addPeerLiquidity(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              peerId,
              amount: '100'
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.addPeerLiquidity
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.error).toBeNull()
    })

    test('Returns an error for invalid id', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddPeerLiquidity($input: AddPeerLiquidityInput!) {
              addPeerLiquidity(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id: 'not a uuid v4',
              peerId,
              amount: '100'
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.addPeerLiquidity
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Invalid id')
      expect(response.error).toEqual(LiquidityError.InvalidId)
    })

    test('Returns an error for unknown peer', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddPeerLiquidity($input: AddPeerLiquidityInput!) {
              addPeerLiquidity(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              peerId: uuid(),
              amount: '100'
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.addPeerLiquidity
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown peer')
      expect(response.error).toEqual(LiquidityError.UnknownPeer)
    })

    test('Returns an error for existing transfer', async (): Promise<void> => {
      const account = await accountFactory.build()
      const id = uuid()
      await addLiquidity({
        id,
        account,
        amount: BigInt(100)
      })
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddPeerLiquidity($input: AddPeerLiquidityInput!) {
              addPeerLiquidity(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id,
              peerId,
              amount: '100'
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.addPeerLiquidity
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Transfer exists')
      expect(response.error).toEqual(LiquidityError.TransferExists)
    })
  })

  describe('Add asset liquidity', (): void => {
    let assetId: string

    beforeEach(
      async (): Promise<void> => {
        assetId = (await assetService.getOrCreate(randomAsset())).id
      }
    )

    test('Can add liquidity to asset', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddAssetLiquidity($input: AddAssetLiquidityInput!) {
              addAssetLiquidity(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              assetId,
              amount: '100'
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.addAssetLiquidity
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.error).toBeNull()
    })

    test('Returns an error for invalid id', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddAssetLiquidity($input: AddAssetLiquidityInput!) {
              addAssetLiquidity(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id: 'not a uuid',
              assetId,
              amount: '100'
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.addAssetLiquidity
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Invalid id')
      expect(response.error).toEqual(LiquidityError.InvalidId)
    })

    test('Returns an error for unknown asset', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddAssetLiquidity($input: AddAssetLiquidityInput!) {
              addAssetLiquidity(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              assetId: uuid(),
              amount: '100'
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.addAssetLiquidity
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown asset')
      expect(response.error).toEqual(LiquidityError.UnknownAsset)
    })

    test('Returns an error for existing transfer', async (): Promise<void> => {
      const account = await accountFactory.build()
      const id = uuid()
      await addLiquidity({
        id,
        account,
        amount: BigInt(100)
      })
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddAssetLiquidity($input: AddAssetLiquidityInput!) {
              addAssetLiquidity(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id,
              assetId,
              amount: '100'
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.addAssetLiquidity
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Transfer exists')
      expect(response.error).toEqual(LiquidityError.TransferExists)
    })
  })

  describe('Create peer liquidity withdrawal', (): void => {
    let peerId: string
    const startingBalance = BigInt(100)

    beforeEach(
      async (): Promise<void> => {
        const peer = await peerFactory.build()
        await addLiquidity({
          account: peer,
          amount: startingBalance
        })
        peerId = peer.id
      }
    )

    test('Can create liquidity withdrawal from peer', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeerLiquidityWithdrawal(
              $input: CreatePeerLiquidityWithdrawalInput!
            ) {
              createPeerLiquidityWithdrawal(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id: uuid(),
              peerId,
              amount: startingBalance.toString()
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.createPeerLiquidityWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.error).toBeNull()
    })

    test('Returns an error for unknown peer', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeerLiquidityWithdrawal(
              $input: CreatePeerLiquidityWithdrawalInput!
            ) {
              createPeerLiquidityWithdrawal(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id: uuid(),
              peerId: uuid(),
              amount: '100'
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.createPeerLiquidityWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown peer')
      expect(response.error).toEqual(LiquidityError.UnknownPeer)
    })

    test('Returns an error for invalid id', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeerLiquidityWithdrawal(
              $input: CreatePeerLiquidityWithdrawalInput!
            ) {
              createPeerLiquidityWithdrawal(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id: 'not a uuid',
              peerId,
              amount: startingBalance.toString()
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.createPeerLiquidityWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Invalid id')
      expect(response.error).toEqual(LiquidityError.InvalidId)
    })

    test('Returns an error for existing transfer', async (): Promise<void> => {
      const account = await accountFactory.build()
      const id = uuid()
      await addLiquidity({
        id,
        account,
        amount: BigInt(10)
      })
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeerLiquidityWithdrawal(
              $input: CreatePeerLiquidityWithdrawalInput!
            ) {
              createPeerLiquidityWithdrawal(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id,
              peerId,
              amount: startingBalance.toString()
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.createPeerLiquidityWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Transfer exists')
      expect(response.error).toEqual(LiquidityError.TransferExists)
    })

    test('Returns error for insufficient balance', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeerLiquidityWithdrawal(
              $input: CreatePeerLiquidityWithdrawalInput!
            ) {
              createPeerLiquidityWithdrawal(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id: uuid(),
              peerId,
              amount: (startingBalance + BigInt(1)).toString()
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.createPeerLiquidityWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('403')
      expect(response.message).toEqual('Insufficient balance')
      expect(response.error).toEqual(LiquidityError.InsufficientBalance)
    })
  })

  describe('Create asset liquidity withdrawal', (): void => {
    let assetId: string
    const startingBalance = BigInt(100)

    beforeEach(
      async (): Promise<void> => {
        const asset = await assetService.getOrCreate(randomAsset())
        await addLiquidity({
          account: {
            asset: {
              unit: asset.unit,
              account: AssetAccount.Liquidity
            }
          },
          amount: startingBalance
        })
        assetId = asset.id
      }
    )

    test('Can create liquidity withdrawal from asset', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAssetLiquidityWithdrawal(
              $input: CreateAssetLiquidityWithdrawalInput!
            ) {
              createAssetLiquidityWithdrawal(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id: uuid(),
              assetId,
              amount: startingBalance.toString()
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.createAssetLiquidityWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.error).toBeNull()
    })

    test('Returns an error for unknown asset', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAssetLiquidityWithdrawal(
              $input: CreateAssetLiquidityWithdrawalInput!
            ) {
              createAssetLiquidityWithdrawal(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id: uuid(),
              assetId: uuid(),
              amount: '100'
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.createAssetLiquidityWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown asset')
      expect(response.error).toEqual(LiquidityError.UnknownAsset)
    })

    test('Returns an error for invalid id', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAssetLiquidityWithdrawal(
              $input: CreateAssetLiquidityWithdrawalInput!
            ) {
              createAssetLiquidityWithdrawal(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id: 'not a uuid',
              assetId,
              amount: startingBalance.toString()
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.createAssetLiquidityWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Invalid id')
      expect(response.error).toEqual(LiquidityError.InvalidId)
    })

    test('Returns an error for existing transfer', async (): Promise<void> => {
      const account = await accountFactory.build()
      const id = uuid()
      await addLiquidity({
        id,
        account,
        amount: BigInt(10)
      })
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAssetLiquidityWithdrawal(
              $input: CreateAssetLiquidityWithdrawalInput!
            ) {
              createAssetLiquidityWithdrawal(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id,
              assetId,
              amount: startingBalance.toString()
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.createAssetLiquidityWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Transfer exists')
      expect(response.error).toEqual(LiquidityError.TransferExists)
    })

    test('Returns error for insufficient balance', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAssetLiquidityWithdrawal(
              $input: CreateAssetLiquidityWithdrawalInput!
            ) {
              createAssetLiquidityWithdrawal(input: $input) {
                code
                success
                message
                error
              }
            }
          `,
          variables: {
            input: {
              id: uuid(),
              assetId,
              amount: (startingBalance + BigInt(1)).toString()
            }
          }
        })
        .then(
          (query): LiquidityMutationResponse => {
            if (query.data) {
              return query.data.createAssetLiquidityWithdrawal
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('403')
      expect(response.message).toEqual('Insufficient balance')
      expect(response.error).toEqual(LiquidityError.InsufficientBalance)
    })
  })

  describe.each(['peer', 'asset'])(
    'Finalize %s liquidity withdrawal',
    (type): void => {
      let withdrawalId: string

      beforeEach(
        async (): Promise<void> => {
          let account: AccountOptions
          if (type === 'peer') {
            account = await peerFactory.build()
          } else {
            assert.equal(type, 'asset')
            account = {
              asset: {
                unit: randomUnit(),
                account: AssetAccount.Liquidity
              }
            }
            await accountingService.createAssetAccounts(account.asset.unit)
          }
          await addLiquidity({
            account,
            amount: BigInt(100)
          })
          withdrawalId = uuid()
          await createLiquidityWithdrawal({
            id: withdrawalId,
            account,
            amount: BigInt(10)
          })
        }
      )

      test(`Can finalize a(n) ${type} liquidity withdrawal`, async (): Promise<void> => {
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation FinalizeLiquidityWithdrawal($withdrawalId: String!) {
                finalizeLiquidityWithdrawal(withdrawalId: $withdrawalId) {
                  code
                  success
                  message
                  error
                }
              }
            `,
            variables: {
              withdrawalId
            }
          })
          .then(
            (query): LiquidityMutationResponse => {
              if (query.data) {
                return query.data.finalizeLiquidityWithdrawal
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        expect(response.error).toBeNull()
      })

      test("Can't finalize non-existent withdrawal", async (): Promise<void> => {
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation FinalizeLiquidityWithdrawal($withdrawalId: String!) {
                finalizeLiquidityWithdrawal(withdrawalId: $withdrawalId) {
                  code
                  success
                  message
                  error
                }
              }
            `,
            variables: {
              withdrawalId: uuid()
            }
          })
          .then(
            (query): LiquidityMutationResponse => {
              if (query.data) {
                return query.data.finalizeLiquidityWithdrawal
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(false)
        expect(response.code).toEqual('404')
        expect(response.message).toEqual('Unknown withdrawal')
        expect(response.error).toEqual(LiquidityError.UnknownTransfer)
      })

      test("Can't finalize invalid withdrawal id", async (): Promise<void> => {
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation FinalizeLiquidityWithdrawal($withdrawalId: String!) {
                finalizeLiquidityWithdrawal(withdrawalId: $withdrawalId) {
                  code
                  success
                  message
                  error
                }
              }
            `,
            variables: {
              withdrawalId: 'not a uuid'
            }
          })
          .then(
            (query): LiquidityMutationResponse => {
              if (query.data) {
                return query.data.finalizeLiquidityWithdrawal
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(false)
        expect(response.code).toEqual('400')
        expect(response.message).toEqual('Invalid id')
        expect(response.error).toEqual(LiquidityError.InvalidId)
      })

      test("Can't finalize finalized withdrawal", async (): Promise<void> => {
        await expect(
          accountingService.commitTransfer(withdrawalId)
        ).resolves.toBeUndefined()
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation FinalizeLiquidityWithdrawal($withdrawalId: String!) {
                finalizeLiquidityWithdrawal(withdrawalId: $withdrawalId) {
                  code
                  success
                  message
                  error
                }
              }
            `,
            variables: {
              withdrawalId
            }
          })
          .then(
            (query): LiquidityMutationResponse => {
              if (query.data) {
                return query.data.finalizeLiquidityWithdrawal
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(false)
        expect(response.code).toEqual('409')
        expect(response.message).toEqual('Withdrawal already finalized')
        expect(response.error).toEqual(LiquidityError.AlreadyCommitted)
      })

      test("Can't finalize rolled back withdrawal", async (): Promise<void> => {
        await expect(
          accountingService.rollbackTransfer(withdrawalId)
        ).resolves.toBeUndefined()
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation FinalizeLiquidityWithdrawal($withdrawalId: String!) {
                finalizeLiquidityWithdrawal(withdrawalId: $withdrawalId) {
                  code
                  success
                  message
                  error
                }
              }
            `,
            variables: {
              withdrawalId
            }
          })
          .then(
            (query): LiquidityMutationResponse => {
              if (query.data) {
                return query.data.finalizeLiquidityWithdrawal
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(false)
        expect(response.code).toEqual('409')
        expect(response.message).toEqual('Withdrawal already rolled back')
        expect(response.error).toEqual(LiquidityError.AlreadyRolledBack)
      })
    }
  )

  describe.each(['peer', 'asset'])(
    'Roll back %s liquidity withdrawal',
    (type): void => {
      let withdrawalId: string

      beforeEach(
        async (): Promise<void> => {
          let account: AccountOptions
          if (type === 'peer') {
            account = await peerFactory.build()
          } else {
            assert.equal(type, 'asset')
            account = {
              asset: {
                unit: randomUnit(),
                account: AssetAccount.Liquidity
              }
            }
            await accountingService.createAssetAccounts(account.asset.unit)
          }
          await addLiquidity({
            account,
            amount: BigInt(100)
          })
          withdrawalId = uuid()
          await createLiquidityWithdrawal({
            id: withdrawalId,
            account,
            amount: BigInt(10)
          })
        }
      )

      test(`Can rollback a(n) ${type} liquidity withdrawal`, async (): Promise<void> => {
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation RollbackLiquidityWithdrawal($withdrawalId: String!) {
                rollbackLiquidityWithdrawal(withdrawalId: $withdrawalId) {
                  code
                  success
                  message
                  error
                }
              }
            `,
            variables: {
              withdrawalId
            }
          })
          .then(
            (query): LiquidityMutationResponse => {
              if (query.data) {
                return query.data.rollbackLiquidityWithdrawal
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        expect(response.error).toBeNull()
      })

      test("Can't rollback non-existent withdrawal", async (): Promise<void> => {
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation RollbackLiquidityWithdrawal($withdrawalId: String!) {
                rollbackLiquidityWithdrawal(withdrawalId: $withdrawalId) {
                  code
                  success
                  message
                  error
                }
              }
            `,
            variables: {
              withdrawalId: uuid()
            }
          })
          .then(
            (query): LiquidityMutationResponse => {
              if (query.data) {
                return query.data.rollbackLiquidityWithdrawal
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(false)
        expect(response.code).toEqual('404')
        expect(response.message).toEqual('Unknown withdrawal')
        expect(response.error).toEqual(LiquidityError.UnknownTransfer)
      })

      test("Can't rollback invalid withdrawal id", async (): Promise<void> => {
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation RollbackLiquidityWithdrawal($withdrawalId: String!) {
                rollbackLiquidityWithdrawal(withdrawalId: $withdrawalId) {
                  code
                  success
                  message
                  error
                }
              }
            `,
            variables: {
              withdrawalId: 'not a uuid'
            }
          })
          .then(
            (query): LiquidityMutationResponse => {
              if (query.data) {
                return query.data.rollbackLiquidityWithdrawal
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(false)
        expect(response.code).toEqual('400')
        expect(response.message).toEqual('Invalid id')
        expect(response.error).toEqual(LiquidityError.InvalidId)
      })

      test("Can't rollback finalized withdrawal", async (): Promise<void> => {
        await expect(
          accountingService.commitTransfer(withdrawalId)
        ).resolves.toBeUndefined()
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation RollbackLiquidityWithdrawal($withdrawalId: String!) {
                rollbackLiquidityWithdrawal(withdrawalId: $withdrawalId) {
                  code
                  success
                  message
                  error
                }
              }
            `,
            variables: {
              withdrawalId
            }
          })
          .then(
            (query): LiquidityMutationResponse => {
              if (query.data) {
                return query.data.rollbackLiquidityWithdrawal
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(false)
        expect(response.code).toEqual('409')
        expect(response.message).toEqual('Withdrawal already finalized')
        expect(response.error).toEqual(LiquidityError.AlreadyCommitted)
      })

      test("Can't rollback rolled back withdrawal", async (): Promise<void> => {
        await expect(
          accountingService.rollbackTransfer(withdrawalId)
        ).resolves.toBeUndefined()
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation RollbackLiquidityWithdrawal($withdrawalId: String!) {
                rollbackLiquidityWithdrawal(withdrawalId: $withdrawalId) {
                  code
                  success
                  message
                  error
                }
              }
            `,
            variables: {
              withdrawalId
            }
          })
          .then(
            (query): LiquidityMutationResponse => {
              if (query.data) {
                return query.data.rollbackLiquidityWithdrawal
              } else {
                throw new Error('Data was empty')
              }
            }
          )

        expect(response.success).toBe(false)
        expect(response.code).toEqual('409')
        expect(response.message).toEqual('Withdrawal already rolled back')
        expect(response.error).toEqual(LiquidityError.AlreadyRolledBack)
      })
    }
  )
})
