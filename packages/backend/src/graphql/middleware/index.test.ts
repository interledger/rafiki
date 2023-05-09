import { gql } from '@apollo/client'
import assert from 'assert'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { AssetService } from '../../asset/service'
import { randomAsset } from '../../tests/asset'
import { AssetMutationResponse, CreateAssetInput } from '../generated/graphql'

describe('GraphQL Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let assetService: AssetService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    assetService = await deps.use('assetService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  const callCreateAssetMutation = async (input: CreateAssetInput) => {
    return appContainer.apolloClient
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
  }

  describe('idempotencyGraphQLMiddleware', (): void => {
    test('returns original response on repeat call with same idempotency key', async (): Promise<void> => {
      const idempotencyKey = uuid()
      const input: CreateAssetInput = {
        ...randomAsset(),
        idempotencyKey
      }

      const createAssetSpy = jest.spyOn(assetService, 'create')

      const initialResponse = await callCreateAssetMutation(input)

      expect(createAssetSpy).toHaveBeenCalledTimes(1)
      assert.ok(initialResponse.asset)
      expect(initialResponse).toEqual({
        __typename: 'AssetMutationResponse',
        message: 'Created Asset',
        success: true,
        code: '200',
        asset: {
          __typename: 'Asset',
          id: initialResponse.asset.id,
          code: input.code,
          scale: input.scale,
          withdrawalThreshold: null
        }
      })
      await expect(
        assetService.get(initialResponse.asset.id)
      ).resolves.toMatchObject({
        id: initialResponse.asset.id,
        code: input.code,
        scale: input.scale,
        withdrawalThreshold: null
      })

      createAssetSpy.mockReset()

      const repeatResponse = await callCreateAssetMutation(input)

      expect(createAssetSpy).not.toHaveBeenCalled()
      assert.ok(repeatResponse.asset)
      expect(repeatResponse).toEqual({
        __typename: 'AssetMutationResponse',
        message: 'Created Asset',
        success: true,
        code: '200',
        asset: {
          __typename: 'Asset',
          id: initialResponse.asset.id,
          code: initialResponse.asset.code,
          scale: initialResponse.asset.scale,
          withdrawalThreshold: null
        }
      })
      await expect(
        assetService.get(repeatResponse.asset.id)
      ).resolves.toMatchObject({
        id: initialResponse.asset.id,
        code: initialResponse.asset.code,
        scale: initialResponse.asset.scale,
        withdrawalThreshold: null
      })
    })

    test('does not return original response on repeat call with different idempotency key', async (): Promise<void> => {
      const input: CreateAssetInput = {
        ...randomAsset(),
        idempotencyKey: uuid()
      }

      const createAssetSpy = jest.spyOn(assetService, 'create')

      const initialResponse = await callCreateAssetMutation(input)

      expect(createAssetSpy).toHaveBeenCalledTimes(1)
      assert.ok(initialResponse.asset)
      expect(initialResponse).toEqual({
        __typename: 'AssetMutationResponse',
        message: 'Created Asset',
        success: true,
        code: '200',
        asset: {
          __typename: 'Asset',
          id: initialResponse.asset.id,
          code: input.code,
          scale: input.scale,
          withdrawalThreshold: null
        }
      })

      createAssetSpy.mockReset()

      const repeatResponse = await callCreateAssetMutation({
        ...input,
        idempotencyKey: uuid()
      })

      expect(createAssetSpy).toHaveBeenCalledTimes(1)
      expect(repeatResponse).toEqual({
        __typename: 'AssetMutationResponse',
        message: 'Asset already exists',
        success: false,
        code: '409',
        asset: null
      })
    })

    test('throws if different input parameters for same idempotency key', async (): Promise<void> => {
      const idempotencyKey = uuid()
      const input: CreateAssetInput = {
        ...randomAsset(),
        idempotencyKey
      }

      const initialResponse = await callCreateAssetMutation(input)

      assert.ok(initialResponse.asset)
      expect(initialResponse).toEqual({
        __typename: 'AssetMutationResponse',
        message: 'Created Asset',
        success: true,
        code: '200',
        asset: {
          __typename: 'Asset',
          id: initialResponse.asset.id,
          code: input.code,
          scale: input.scale,
          withdrawalThreshold: null
        }
      })

      await expect(
        callCreateAssetMutation({
          ...input,
          scale: (input.scale + 1) % 256
        })
      ).rejects.toThrow(
        `Incoming arguments are different than the original request for idempotencyKey: ${idempotencyKey}`
      )
    })
  })
})
