import { gql } from '@apollo/client'
import assert from 'assert'
// import { StartedTestContainer } from 'testcontainers'
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
// import { startTigerbeetleContainer } from '../../tests/tigerbeetle'
import {
  AssetMutationResponse,
  Asset,
  AssetsConnection,
  CreateAssetInput
} from '../generated/graphql'

describe('Asset Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let assetService: AssetService
  // let tigerbeetleContainer: StartedTestContainer

  beforeAll(async (): Promise<void> => {
    // const { container, port } = await startTigerbeetleContainer()
    // tigerbeetleContainer = container
    // Config.tigerbeetleReplicaAddresses = [port]

    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    assetService = await deps.use('assetService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
    // await tigerbeetleContainer.stop()
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
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Asset($assetId: String!) {
              asset(id: $assetId) {
                id
                code
                scale
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

      expect(query).toEqual({
        __typename: 'Asset',
        id: asset.id,
        code: asset.code,
        scale: asset.scale,
        withdrawalThreshold: asset.withdrawalThreshold.toString(),
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
