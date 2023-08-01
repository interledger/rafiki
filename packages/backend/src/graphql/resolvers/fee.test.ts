import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import { truncateTables } from '../../tests/tableManager'
import { gql } from '@apollo/client'
import { UpdateFeeResponse } from '../generated/graphql'
import { Asset } from '../../asset/model'
import { createAsset } from '../../tests/asset'
import { FeeType } from '../../fee/model'
import { FeeService } from '../../fee/service'
import { v4 } from 'uuid'

describe('Fee Resolvers', () => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let asset: Asset
  let feeService: FeeService

  beforeAll(async () => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    feeService = await deps.use('feeService')
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async () => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async () => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('updateFee mutation', () => {
    test('Can add fee to an asset', async () => {
      const input = {
        assetId: asset.id,
        type: FeeType.Sending,
        fee: {
          fixed: BigInt(100),
          percentage: 0.01
        }
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateFee($input: UpdateFeeInput!) {
              updateFee(input: $input) {
                code
                success
                message
                fee {
                  id
                  assetId
                  type
                  fixed
                  percentage
                  createdAt
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): UpdateFeeResponse => {
          if (query.data) {
            return query.data.updateFee
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.message).toEqual('Fee updated')
      expect(response.fee).toMatchObject({
        __typename: 'Fee',
        assetId: input.assetId,
        type: input.type,
        fixed: input.fee.fixed.toString(),
        percentage: input.fee.percentage
      })
    })

    test('Returns error for unknown asset', async (): Promise<void> => {
      const input = {
        assetId: v4(),
        type: FeeType.Sending,
        fee: {
          fixed: BigInt(100),
          percentage: 0.01
        }
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateFee($input: UpdateFeeInput!) {
              updateFee(input: $input) {
                code
                success
                message
                fee {
                  id
                  assetId
                  type
                  fixed
                  percentage
                  createdAt
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): UpdateFeeResponse => {
          if (query.data) {
            return query.data.updateFee
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('unknown asset')
      expect(response.fee).toBeNull()
    })

    test('Returns error for invalid percent fee', async (): Promise<void> => {
      const input = {
        assetId: asset.id,
        type: FeeType.Sending,
        fee: {
          fixed: BigInt(100),
          percentage: -1
        }
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateFee($input: UpdateFeeInput!) {
              updateFee(input: $input) {
                code
                success
                message
                fee {
                  id
                  assetId
                  type
                  fixed
                  percentage
                  createdAt
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): UpdateFeeResponse => {
          if (query.data) {
            return query.data.updateFee
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toEqual('422')
      expect(response.message).toEqual('Percent fee must be between 0 and 1')
      expect(response.fee).toBeNull()
    })

    test('Returns 500 error for unhandled errors', async (): Promise<void> => {
      jest.spyOn(feeService, 'create').mockImplementationOnce(async () => {
        throw new Error('Unknown error')
      })
      const input = {
        assetId: asset.id,
        type: FeeType.Sending,
        fee: {
          fixed: BigInt(100),
          percentage: -1
        }
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateFee($input: UpdateFeeInput!) {
              updateFee(input: $input) {
                code
                success
                message
                fee {
                  id
                  assetId
                  type
                  fixed
                  percentage
                  createdAt
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): UpdateFeeResponse => {
          if (query.data) {
            return query.data.updateFee
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toEqual('500')
      expect(response.message).toEqual('Error trying to update fee')
      expect(response.fee).toBeNull()
    })
  })
})
