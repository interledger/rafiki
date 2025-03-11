import { ApolloError, gql } from '@apollo/client'
import assert from 'assert'
import { v4 as uuid } from 'uuid'

import { getPageTests } from './page.test'
import {
  createApolloClient,
  createTestApp,
  TestContainer
} from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import {
  isAssetError,
  AssetError,
  errorToCode,
  errorToMessage
} from '../../asset/errors'
import { Asset as AssetModel } from '../../asset/model'
import { AssetService } from '../../asset/service'
import { randomAsset } from '../../tests/asset'
import {
  AssetMutationResponse,
  Asset,
  AssetsConnection,
  CreateAssetInput,
  FeesConnection
} from '../generated/graphql'
import { AccountingService } from '../../accounting/service'
import { FeeService } from '../../fee/service'
import { Fee, FeeType } from '../../fee/model'
import { isFeeError } from '../../fee/errors'
import { createFee } from '../../tests/fee'
import { createAsset } from '../../tests/asset'
import { GraphQLErrorCode } from '../errors'
import { createTenant } from '../../tests/tenant'

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
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Create Asset', (): void => {
    test.each`
      withdrawalThreshold | expectedWithdrawalThreshold | liquidityThreshold | expectedLiquidityThreshold
      ${undefined}        | ${null}                     | ${undefined}       | ${null}
      ${BigInt(0)}        | ${'0'}                      | ${undefined}       | ${null}
      ${BigInt(5)}        | ${'5'}                      | ${undefined}       | ${null}
      ${undefined}        | ${null}                     | ${BigInt(0)}       | ${'0'}
      ${undefined}        | ${null}                     | ${BigInt(5)}       | ${'5'}
      ${BigInt(0)}        | ${'0'}                      | ${BigInt(0)}       | ${'0'}
      ${BigInt(5)}        | ${'5'}                      | ${BigInt(5)}       | ${'5'}
    `(
      'Can create an asset (withdrawalThreshold: $withdrawalThreshold, liquidityThreshold: $liquidityThreshold)',
      async ({
        withdrawalThreshold,
        expectedWithdrawalThreshold,
        liquidityThreshold,
        expectedLiquidityThreshold
      }): Promise<void> => {
        const input: CreateAssetInput = {
          ...randomAsset(),
          withdrawalThreshold,
          liquidityThreshold
        }

        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreateAsset($input: CreateAssetInput!) {
                createAsset(input: $input) {
                  asset {
                    id
                    code
                    scale
                    liquidity
                    withdrawalThreshold
                    liquidityThreshold
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

        assert.ok(response.asset)
        expect(response.asset).toEqual({
          __typename: 'Asset',
          id: response.asset.id,
          code: input.code,
          scale: input.scale,
          liquidity: '0',
          withdrawalThreshold: expectedWithdrawalThreshold,
          liquidityThreshold: expectedLiquidityThreshold
        })
        await expect(
          assetService.get(response.asset.id)
        ).resolves.toMatchObject({
          ...input,
          withdrawalThreshold: withdrawalThreshold ?? null,
          liquidityThreshold: liquidityThreshold ?? null
        })
      }
    )

    test('Returns error for duplicate asset', async (): Promise<void> => {
      const input = randomAsset()

      await assetService.create({ ...input, tenantId: Config.operatorTenantId })

      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreateAsset($input: CreateAssetInput!) {
                createAsset(input: $input) {
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
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[AssetError.DuplicateAsset],
            extensions: expect.objectContaining({
              code: errorToCode[AssetError.DuplicateAsset]
            })
          })
        )
      }
    })

    test('handles unexpected error', async (): Promise<void> => {
      jest
        .spyOn(assetService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))

      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreateAsset($input: CreateAssetInput!) {
                createAsset(input: $input) {
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
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: 'unexpected',
            extensions: expect.objectContaining({
              code: GraphQLErrorCode.InternalServerError
            })
          })
        )
      }
    })

    test('bad input data when not allowed to perform cross tenant create', async (): Promise<void> => {
      const otherTenant = await createTenant(deps)
      const badInputData = {
        ...randomAsset(),
        tenantId: uuid()
      }

      const tenantedApolloClient = await createApolloClient(
        appContainer.container,
        appContainer.app,
        otherTenant.id
      )
      try {
        expect.assertions(2)
        await tenantedApolloClient
          .mutate({
            mutation: gql`
              mutation CreateAsset($input: CreateAssetInput!) {
                createAsset(input: $input) {
                  asset {
                    id
                  }
                }
              }
            `,
            variables: {
              input: badInputData
            }
          })
          .then((query): AssetMutationResponse => {
            if (query.data) {
              return query.data.createAsset
            } else {
              throw new Error('Data was empty')
            }
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: 'Assignment to the specified tenant is not permitted',
            extensions: expect.objectContaining({
              code: GraphQLErrorCode.BadUserInput
            })
          })
        )
      }
    })
  })

  describe('Asset Queries', (): void => {
    test('Can get an asset', async (): Promise<void> => {
      const asset = await assetService.create({
        ...randomAsset(),
        tenantId: Config.operatorTenantId,
        withdrawalThreshold: BigInt(10),
        liquidityThreshold: BigInt(100)
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
                  liquidityThreshold
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
        liquidityThreshold: asset.liquidityThreshold?.toString(),
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
        liquidityThreshold: asset.liquidityThreshold?.toString(),
        createdAt: new Date(+asset.createdAt).toISOString()
      })
    })

    test('Can get an asset by code and scale', async (): Promise<void> => {
      const asset = await assetService.create({
        ...randomAsset(),
        tenantId: Config.operatorTenantId,
        withdrawalThreshold: BigInt(10),
        liquidityThreshold: BigInt(100)
      })
      assert.ok(!isAssetError(asset))
      assert.ok(asset.withdrawalThreshold)
      const args = { code: asset.code, scale: asset.scale }
      const query = async () =>
        await appContainer.apolloClient
          .query({
            query: gql`
              query GetAssetByCodeAndScale($code: String!, $scale: UInt8!) {
                assetByCodeAndScale(code: $code, scale: $scale) {
                  id
                  code
                  scale
                  liquidity
                  withdrawalThreshold
                  liquidityThreshold
                  createdAt
                }
              }
            `,
            variables: args
          })
          .then((query): Asset => {
            if (query.data) {
              return query.data.assetByCodeAndScale
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
        liquidityThreshold: asset.liquidityThreshold?.toString(),
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
        liquidityThreshold: asset.liquidityThreshold?.toString(),
        createdAt: new Date(+asset.createdAt).toISOString()
      })
    })

    test.each([
      undefined,
      { fixed: BigInt(100), basisPoints: 1000, type: FeeType.Sending },
      { fixed: BigInt(100), basisPoints: 1000, type: FeeType.Receiving }
    ])('Can get an asset with fee of %p', async (fee): Promise<void> => {
      const asset = await assetService.create({
        ...randomAsset(),
        tenantId: Config.operatorTenantId
      })
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
      expect.assertions(2)
      try {
        await appContainer.apolloClient
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
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[AssetError.UnknownAsset],
            extensions: expect.objectContaining({
              code: errorToCode[AssetError.UnknownAsset]
            })
          })
        )
      }
    })
  })

  describe('Assets Queries', (): void => {
    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        assetService.create({
          ...randomAsset(),
          tenantId: Config.operatorTenantId,
          withdrawalThreshold: BigInt(10),
          liquidityThreshold: BigInt(100)
        }) as Promise<AssetModel>,
      pagedQuery: 'assets'
    })

    test('Can get assets', async (): Promise<void> => {
      const assets: AssetModel[] = []
      for (let i = 0; i < 2; i++) {
        const asset = await assetService.create({
          ...randomAsset(),
          tenantId: Config.operatorTenantId,
          withdrawalThreshold: BigInt(10),
          liquidityThreshold: BigInt(100)
        })
        assert.ok(!isAssetError(asset))
        assets.push(asset)
      }
      assets.reverse() // Calling the default getPage will result in descending order
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
                    liquidityThreshold
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
        assert.ok(asset.liquidityThreshold)
        expect(edge.cursor).toEqual(asset.id)
        expect(edge.node).toEqual({
          __typename: 'Asset',
          id: asset.id,
          code: asset.code,
          scale: asset.scale,
          withdrawalThreshold: asset.withdrawalThreshold.toString(),
          liquidityThreshold: asset.liquidityThreshold.toString()
        })
      })
    })

    describe('fees query', () => {
      let assetId: string
      beforeEach(async (): Promise<void> => {
        assetId = (await createAsset(deps)).id
      })

      getPageTests({
        getClient: () => appContainer.apolloClient,
        createModel: () => createFee(deps, assetId),
        pagedQuery: `fees`,
        parent: {
          query: 'asset',
          getId: () => assetId
        }
      })

      test('Can get fees', async (): Promise<void> => {
        const fees: Fee[] = []
        for (let i = 0; i < 2; i++) {
          const fee = await createFee(deps, assetId)
          assert.ok(!isFeeError(fee))
          fees.push(fee)
        }
        fees.reverse() // default order is descending
        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query Query($assetId: String!) {
                asset(id: $assetId) {
                  fees {
                    edges {
                      node {
                        id
                        type
                        assetId
                        basisPoints
                        fixed
                      }
                      cursor
                    }
                  }
                }
              }
            `,
            variables: {
              assetId
            }
          })
          .then((query): FeesConnection => {
            if (query.data) {
              return query.data.asset.fees
            } else {
              throw new Error('Data was empty')
            }
          })
        expect(query.edges).toHaveLength(2)
        query.edges.forEach((edge, idx) => {
          const fee = fees[idx]
          expect(edge.cursor).toEqual(fee.id)
          expect(edge.node).toEqual({
            __typename: 'Fee',
            id: fee.id,
            type: fee.type,
            assetId: assetId,
            basisPoints: fee.basisPointFee,
            fixed: fee.fixedFee.toString()
          })
        })
      })
    })
  })

  describe('updateAsset', (): void => {
    describe.each`
      withdrawalThreshold | liquidityThreshold
      ${null}             | ${null}
      ${BigInt(0)}        | ${null}
      ${BigInt(5)}        | ${null}
      ${null}             | ${BigInt(0)}
      ${null}             | ${BigInt(5)}
      ${BigInt(0)}        | ${BigInt(0)}
      ${BigInt(5)}        | ${BigInt(5)}
    `(
      'from withdrawalThreshold: $withdrawalThreshold and liquidityThreshold: $liquidityThreshold',
      ({ withdrawalThreshold, liquidityThreshold }): void => {
        let asset: AssetModel

        beforeEach(async (): Promise<void> => {
          asset = (await assetService.create({
            ...randomAsset(),
            tenantId: Config.operatorTenantId,
            withdrawalThreshold,
            liquidityThreshold
          })) as AssetModel
          assert.ok(!isAssetError(asset))
        })

        test.each`
          withdrawalThreshold | liquidityThreshold
          ${null}             | ${null}
          ${BigInt(0)}        | ${null}
          ${BigInt(5)}        | ${null}
          ${null}             | ${BigInt(0)}
          ${null}             | ${BigInt(5)}
          ${BigInt(0)}        | ${BigInt(0)}
          ${BigInt(5)}        | ${BigInt(5)}
        `(
          'to withdrawalThreshold: $withdrawalThreshold and liquidityThreshold: $liquidityThreshold',
          async ({ withdrawalThreshold }): Promise<void> => {
            const response = await appContainer.apolloClient
              .mutate({
                mutation: gql`
                  mutation updateAsset($input: UpdateAssetInput!) {
                    updateAsset(input: $input) {
                      asset {
                        id
                        code
                        scale
                        withdrawalThreshold
                        liquidityThreshold
                      }
                    }
                  }
                `,
                variables: {
                  input: {
                    id: asset.id,
                    withdrawalThreshold,
                    liquidityThreshold
                  }
                }
              })
              .then((query): AssetMutationResponse => {
                if (query.data) {
                  return query.data.updateAsset
                } else {
                  throw new Error('Data was empty')
                }
              })

            expect(response.asset).toEqual({
              __typename: 'Asset',
              id: asset.id,
              code: asset.code,
              scale: asset.scale,
              withdrawalThreshold:
                withdrawalThreshold === null
                  ? null
                  : withdrawalThreshold.toString(),
              liquidityThreshold:
                liquidityThreshold === null
                  ? null
                  : liquidityThreshold.toString()
            })
            await expect(assetService.get(asset.id)).resolves.toMatchObject({
              withdrawalThreshold,
              liquidityThreshold
            })
          }
        )
      }
    )

    test('Returns error for unknown asset', async (): Promise<void> => {
      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation updateAsset($input: UpdateAssetInput!) {
                updateAsset(input: $input) {
                  asset {
                    id
                  }
                }
              }
            `,
            variables: {
              input: {
                id: uuid(),
                withdrawalThreshold: BigInt(10),
                liquidityThreshold: BigInt(100)
              }
            }
          })
          .then((query): AssetMutationResponse => {
            if (query.data) {
              return query.data.updateAsset
            } else {
              throw new Error('Data was empty')
            }
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[AssetError.UnknownAsset],
            extensions: expect.objectContaining({
              code: errorToCode[AssetError.UnknownAsset]
            })
          })
        )
      }
    })
  })

  describe('Delete Asset', (): void => {
    let asset: AssetModel

    beforeEach(async (): Promise<void> => {
      asset = await createAsset(deps)
    })

    test('Can delete an asset', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation DeleteAsset($input: DeleteAssetInput!) {
              deleteAsset(input: $input) {
                asset {
                  id
                }
              }
            }
          `,
          variables: {
            input: {
              id: asset.id
            }
          }
        })
        .then((query): AssetMutationResponse => {
          if (query.data) {
            return query.data.deleteAsset
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.asset?.id).toEqual(asset.id)
      await expect(assetService.get(asset.id)).resolves.toBeUndefined()
    })

    test('Returns error for unknown asset', async (): Promise<void> => {
      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation DeleteAsset($input: DeleteAssetInput!) {
                deleteAsset(input: $input) {
                  asset {
                    id
                  }
                }
              }
            `,
            variables: {
              input: {
                id: uuid()
              }
            }
          })
          .then((query): AssetMutationResponse => {
            if (query.data) {
              return query.data.deleteAsset
            } else {
              throw new Error('Data was empty')
            }
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[AssetError.UnknownAsset],
            extensions: expect.objectContaining({
              code: errorToCode[AssetError.UnknownAsset]
            })
          })
        )
      }
    })

    test('Returns error if unexpected error', async (): Promise<void> => {
      jest.spyOn(assetService, 'delete').mockImplementationOnce(async () => {
        throw new Error('unexpected')
      })

      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation DeleteAsset($input: DeleteAssetInput!) {
                deleteAsset(input: $input) {
                  asset {
                    id
                  }
                }
              }
            `,
            variables: {
              input: {
                id: asset.id
              }
            }
          })
          .then((query): AssetMutationResponse => {
            if (query.data) {
              return query.data.deleteAsset
            } else {
              throw new Error('Data was empty')
            }
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: 'unexpected',
            extensions: expect.objectContaining({
              code: GraphQLErrorCode.InternalServerError
            })
          })
        )
      }
    })
  })
})
