import { ApolloError, gql } from '@apollo/client'
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
import {
  AssetMutationResponse,
  CreateAssetInput,
  UpdateAssetInput
} from '../generated/graphql'
import { GraphQLError } from 'graphql'
import { AssetError, errorToMessage, errorToCode } from '../../asset/errors'

describe('GraphQL Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let assetService: AssetService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      localCacheDuration: 0
    })
    appContainer = await createTestApp(deps)
    assetService = await deps.use('assetService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
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

  const callUpdateAssetMutation = async (input: UpdateAssetInput) => {
    return appContainer.apolloClient
      .mutate({
        mutation: gql`
          mutation UpdateAsset($input: UpdateAssetInput!) {
            updateAsset(input: $input) {
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
          return query.data.updateAsset
        } else {
          throw new Error('Data was empty')
        }
      })
  }

  describe('idempotencyGraphQLMiddleware', (): void => {
    let createInput: CreateAssetInput
    let createResponse: AssetMutationResponse

    beforeEach(async (): Promise<void> => {
      createInput = {
        ...randomAsset(),
        idempotencyKey: uuid()
      }

      createResponse = await callCreateAssetMutation(createInput)
      assert.ok(createResponse.asset)
    })

    test('returns original response on repeat call with same idempotency key', async (): Promise<void> => {
      const idempotencyKey = uuid()
      assert.ok(createResponse.asset)
      const input: UpdateAssetInput = {
        id: createResponse.asset.id,
        withdrawalThreshold: BigInt(10),
        idempotencyKey
      }

      const updateAssetSpy = jest.spyOn(assetService, 'update')

      const initialResponse = await callUpdateAssetMutation(input)

      expect(updateAssetSpy).toHaveBeenCalledTimes(1)
      assert.ok(initialResponse.asset)
      expect(initialResponse).toEqual({
        __typename: 'AssetMutationResponse',
        asset: {
          __typename: 'Asset',
          id: initialResponse.asset.id,
          code: createInput.code,
          scale: createInput.scale,
          withdrawalThreshold: '10'
        }
      })
      await expect(
        assetService.get(initialResponse.asset.id)
      ).resolves.toMatchObject({
        id: initialResponse.asset.id,
        code: createInput.code,
        scale: createInput.scale,
        withdrawalThreshold: BigInt(10)
      })

      updateAssetSpy.mockClear()

      const repeatResponse = await callUpdateAssetMutation(input)

      expect(updateAssetSpy).not.toHaveBeenCalled()
      assert.ok(repeatResponse.asset)
      expect(repeatResponse).toEqual({
        __typename: 'AssetMutationResponse',
        asset: {
          __typename: 'Asset',
          id: initialResponse.asset.id,
          code: initialResponse.asset.code,
          scale: initialResponse.asset.scale,
          withdrawalThreshold: '10'
        }
      })
      await expect(
        assetService.get(repeatResponse.asset.id)
      ).resolves.toMatchObject({
        id: initialResponse.asset.id,
        code: initialResponse.asset.code,
        scale: initialResponse.asset.scale,
        withdrawalThreshold: BigInt(10)
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
        asset: {
          __typename: 'Asset',
          id: initialResponse.asset.id,
          code: input.code,
          scale: input.scale,
          withdrawalThreshold: null
        }
      })

      createAssetSpy.mockClear()

      let error
      try {
        await callCreateAssetMutation({
          ...input,
          idempotencyKey: uuid()
        })
      } catch (err) {
        error = err
      }
      expect(error).toBeInstanceOf(ApolloError)
      expect((error as ApolloError).graphQLErrors).toContainEqual(
        expect.objectContaining({
          message: errorToMessage[AssetError.DuplicateAsset],
          extensions: expect.objectContaining({
            code: errorToCode[AssetError.DuplicateAsset]
          })
        })
      )
      expect(createAssetSpy).toHaveBeenCalledTimes(1)
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
          ...randomAsset(),
          idempotencyKey
        })
      ).rejects.toThrow(
        `Incoming arguments are different than the original request for idempotencyKey: ${idempotencyKey}`
      )
    })
  })

  describe('lockGraphQLMutationMiddleware', (): void => {
    test('throws error on concurrent call with same key', async (): Promise<void> => {
      const input: CreateAssetInput = {
        ...randomAsset(),
        idempotencyKey: uuid()
      }

      const createAssetSpy = jest.spyOn(assetService, 'create')

      const [firstRequest, secondRequest, thirdRequest] =
        await Promise.allSettled([
          callCreateAssetMutation(input),
          callCreateAssetMutation(input),
          callCreateAssetMutation(input)
        ])

      assert.ok('value' in firstRequest)

      expect(firstRequest).toEqual({
        status: 'fulfilled',
        value: {
          __typename: 'AssetMutationResponse',
          asset: {
            __typename: 'Asset',
            id: firstRequest.value?.asset?.id,
            code: input.code,
            scale: input.scale,
            withdrawalThreshold: null
          }
        }
      })
      expect(secondRequest).toEqual({
        status: 'rejected',
        reason: new GraphQLError(
          `Concurrent request for idempotencyKey: ${input.idempotencyKey}`
        )
      })
      expect(thirdRequest).toEqual({
        status: 'rejected',
        reason: new GraphQLError(
          `Concurrent request for idempotencyKey: ${input.idempotencyKey}`
        )
      })
      expect(createAssetSpy).toHaveBeenCalledTimes(1)
    })
  })
})
