import { gql } from '@apollo/client'
import assert from 'assert'
import { v4 as uuid } from 'uuid'
import { ApolloError } from '@apollo/client'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { isAssetError } from '../../asset/errors'
import { Asset as AssetModel } from '../../asset/model'
import { AssetService } from '../../asset/service'
import { randomAsset } from '../../tests/asset'
import {
  AssetMutationResponse,
  Asset,
  AssetsConnection,
  CreateAssetInput
} from '../generated/graphql'
import { AccountingService } from '../../accounting/service'
import { FeeService } from '../../fee/service'
import { Fee, FeeType } from '../../fee/model'
import { isFeeError } from '../../fee/errors'

describe('Asset Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let assetService: AssetService
  let accountingService: AccountingService
  let feeService: FeeService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    assetService = await deps.use('assetService')
    accountingService = await deps.use('accountingService')
    feeService = await deps.use('feeService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Create Asset', (): void => {
    test.each`
      withdrawalThreshold | expectedWithdrawalThreshold
      ${undefined}        | ${null}
      ${BigInt(0)}        | ${'0'}
      ${BigInt(5)}        | ${'5'}
    `(
      'Can create an asset (withdrawalThreshold: $withdrawalThreshold)',
      async ({
        withdrawalThreshold,
        expectedWithdrawalThreshold
      }): Promise<void> => {
        const input: CreateAssetInput = {
          ...randomAsset(),
          withdrawalThreshold
        }

        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreateAsset($input: CreateAssetInput!) {
                createAsset(input: $input) {
                  code
                  success
                  message
                  asset {
                    id
                    code
                    scale
                    liquidity
                    withdrawalThreshold
                  }
                }
              }
            `,
            variables: {
              input
            }
          })
          .then((query): AssetMutationResponse => {
            if (query.data) {
              return query.data.createAsset
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        assert.ok(response.asset)
        expect(response.asset).toEqual({
          __typename: 'Asset',
          id: response.asset.id,
          code: input.code,
          scale: input.scale,
          liquidity: '0',
          withdrawalThreshold: expectedWithdrawalThreshold
        })
        await expect(
          assetService.get(response.asset.id)
        ).resolves.toMatchObject({
          ...input,
          withdrawalThreshold: withdrawalThreshold ?? null
        })
      }
    )

    test('Returns error for duplicate asset', async (): Promise<void> => {
      const input = randomAsset()
      await expect(assetService.create(input)).resolves.toMatchObject(input)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAsset($input: CreateAssetInput!) {
              createAsset(input: $input) {
                code
                success
                message
                asset {
                  id
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): AssetMutationResponse => {
          if (query.data) {
            return query.data.createAsset
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Asset already exists')
    })

    test('500', async (): Promise<void> => {
      jest
        .spyOn(assetService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAsset($input: CreateAssetInput!) {
              createAsset(input: $input) {
                code
                success
                message
                asset {
                  id
                }
              }
            }
          `,
          variables: {
            input: randomAsset()
          }
        })
        .then((query): AssetMutationResponse => {
          if (query.data) {
            return query.data.createAsset
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(response.code).toBe('500')
      expect(response.success).toBe(false)
      expect(response.message).toBe('Error trying to create asset')
    })
  })

  describe('Asset Queries', (): void => {
    test('Can get an asset', async (): Promise<void> => {
      const asset = await assetService.create({
        ...randomAsset(),
        withdrawalThreshold: BigInt(10)
      })
      assert.ok(!isAssetError(asset))
      assert.ok(asset.withdrawalThreshold)
      const query = async () =>
        await appContainer.apolloClient
          .query({
            query: gql`
              query Asset($assetId: String!) {
                asset(id: $assetId) {
                  id
                  code
                  scale
                  liquidity
                  withdrawalThreshold
                  createdAt
                }
              }
            `,
            variables: {
              assetId: asset.id
            }
          })
          .then((query): Asset => {
            if (query.data) {
              return query.data.asset
            } else {
              throw new Error('Data was empty')
            }
          })

      await expect(query()).resolves.toEqual({
        __typename: 'Asset',
        id: asset.id,
        code: asset.code,
        scale: asset.scale,
        liquidity: '0',
        withdrawalThreshold: asset.withdrawalThreshold.toString(),
        createdAt: new Date(+asset.createdAt).toISOString()
      })

      await accountingService.createDeposit({
        id: uuid(),
        account: asset,
        amount: BigInt(100)
      })

      await expect(query()).resolves.toEqual({
        __typename: 'Asset',
        id: asset.id,
        code: asset.code,
        scale: asset.scale,
        liquidity: '100',
        withdrawalThreshold: asset.withdrawalThreshold.toString(),
        createdAt: new Date(+asset.createdAt).toISOString()
      })
    })

    test.each([
      undefined,
      { fixed: BigInt(100), basisPoints: 1000, type: FeeType.Sending },
      { fixed: BigInt(100), basisPoints: 1000, type: FeeType.Receiving }
    ])('Can get an asset with fee of %p', async (fee): Promise<void> => {
      const asset = await assetService.create(randomAsset())
      assert.ok(!isAssetError(asset))

      let expectedFee = null

      if (fee) {
        const feeOrError = await feeService.create({
          assetId: asset.id,
          type: fee.type,
          fee: {
            fixed: fee.fixed,
            basisPoints: fee.basisPoints
          }
        })
        assert.ok(!isFeeError(fee))
        const foundFee = feeOrError as Fee
        expectedFee = {
          __typename: 'Fee',
          id: foundFee.id,
          assetId: asset.id,
          type: foundFee.type,
          fixed: foundFee.fixedFee.toString(),
          basisPoints: foundFee.basisPointFee
        }
      }

      const query = async () =>
        await appContainer.apolloClient
          .query({
            query: gql`
              query Asset($assetId: String!) {
                asset(id: $assetId) {
                  id
                  code
                  scale
                  sendingFee {
                    id
                    assetId
                    type
                    fixed
                    basisPoints
                  }
                  receivingFee {
                    id
                    assetId
                    type
                    fixed
                    basisPoints
                  }
                  createdAt
                }
              }
            `,
            variables: {
              assetId: asset.id
            }
          })
          .then((query): Asset => {
            if (query.data) {
              return query.data.asset
            } else {
              throw new Error('Data was empty')
            }
          })

      await expect(query()).resolves.toEqual({
        __typename: 'Asset',
        id: asset.id,
        code: asset.code,
        scale: asset.scale,
        sendingFee: expectedFee?.type === FeeType.Sending ? expectedFee : null,
        receivingFee:
          expectedFee?.type === FeeType.Receiving ? expectedFee : null,
        createdAt: new Date(+asset.createdAt).toISOString()
      })
    })

    test('Returns error for unknown asset', async (): Promise<void> => {
      const gqlQuery = appContainer.apolloClient
        .query({
          query: gql`
            query Asset($assetId: String!) {
              asset(id: $assetId) {
                id
              }
            }
          `,
          variables: {
            assetId: uuid()
          }
        })
        .then((query): Asset => {
          if (query.data) {
            return query.data.asset
          } else {
            throw new Error('Data was empty')
          }
        })

      await expect(gqlQuery).rejects.toThrow(ApolloError)
    })
  })

  describe('Assets Queries', (): void => {
    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        assetService.create({
          ...randomAsset(),
          withdrawalThreshold: BigInt(10)
        }) as Promise<AssetModel>,
      pagedQuery: 'assets'
    })

    test('Can get assets', async (): Promise<void> => {
      const assets: AssetModel[] = []
      for (let i = 0; i < 2; i++) {
        const asset = await assetService.create({
          ...randomAsset(),
          withdrawalThreshold: BigInt(10)
        })
        assert.ok(!isAssetError(asset))
        assets.push(asset)
      }
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Assets {
              assets {
                edges {
                  node {
                    id
                    code
                    scale
                    withdrawalThreshold
                  }
                  cursor
                }
              }
            }
          `
        })
        .then((query): AssetsConnection => {
          if (query.data) {
            return query.data.assets
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(query.edges).toHaveLength(2)
      query.edges.forEach((edge, idx) => {
        const asset = assets[idx]
        assert.ok(asset.withdrawalThreshold)
        expect(edge.cursor).toEqual(asset.id)
        expect(edge.node).toEqual({
          __typename: 'Asset',
          id: asset.id,
          code: asset.code,
          scale: asset.scale,
          withdrawalThreshold: asset.withdrawalThreshold.toString()
        })
      })
    })
  })

  describe('updateAssetWithdrawalThreshold', (): void => {
    describe.each`
      withdrawalThreshold
      ${null}
      ${BigInt(0)}
      ${BigInt(5)}
    `('from $withdrawalThreshold', ({ withdrawalThreshold }): void => {
      let asset: AssetModel

      beforeEach(async (): Promise<void> => {
        asset = (await assetService.create({
          ...randomAsset(),
          withdrawalThreshold
        })) as AssetModel
        assert.ok(!isAssetError(asset))
      })

      test.each`
        withdrawalThreshold
        ${null}
        ${BigInt(0)}
        ${BigInt(5)}
      `(
        'to $withdrawalThreshold',
        async ({ withdrawalThreshold }): Promise<void> => {
          const response = await appContainer.apolloClient
            .mutate({
              mutation: gql`
                mutation UpdateAssetWithdrawalThreshold(
                  $input: UpdateAssetInput!
                ) {
                  updateAssetWithdrawalThreshold(input: $input) {
                    code
                    success
                    message
                    asset {
                      id
                      code
                      scale
                      withdrawalThreshold
                    }
                  }
                }
              `,
              variables: {
                input: {
                  id: asset.id,
                  withdrawalThreshold
                }
              }
            })
            .then((query): AssetMutationResponse => {
              if (query.data) {
                return query.data.updateAssetWithdrawalThreshold
              } else {
                throw new Error('Data was empty')
              }
            })

          expect(response.success).toBe(true)
          expect(response.code).toEqual('200')
          expect(response.asset).toEqual({
            __typename: 'Asset',
            id: asset.id,
            code: asset.code,
            scale: asset.scale,
            withdrawalThreshold:
              withdrawalThreshold === null
                ? null
                : withdrawalThreshold.toString()
          })
          await expect(assetService.get(asset.id)).resolves.toMatchObject({
            withdrawalThreshold
          })
        }
      )
    })

    test('Returns error for unknown asset', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateAssetWithdrawalThreshold($input: UpdateAssetInput!) {
              updateAssetWithdrawalThreshold(input: $input) {
                code
                success
                message
                asset {
                  id
                }
              }
            }
          `,
          variables: {
            input: {
              id: uuid(),
              withdrawalThreshold: BigInt(10)
            }
          }
        })
        .then((query): AssetMutationResponse => {
          if (query.data) {
            return query.data.updateAssetWithdrawalThreshold
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown asset')
    })
  })
})
