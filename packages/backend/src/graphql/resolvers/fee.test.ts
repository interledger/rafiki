import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import { truncateTables } from '../../tests/tableManager'
import { gql } from '@apollo/client'
import { SetFeeResponse } from '../generated/graphql'
import { Asset } from '../../asset/model'
import { createAsset } from '../../tests/asset'
import { FeeType } from '../../fee/model'
import { FeeService } from '../../fee/service'
import { v4 } from 'uuid'
import { GraphQLError } from 'graphql'
import { FeeError, errorToMessage, errorToCode } from '../../fee/errors'
import { GraphQLErrorCode } from '../errors'

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

  describe('setFee mutation', () => {
    test('Can add fee to an asset', async () => {
      const input = {
        assetId: asset.id,
        type: FeeType.Sending,
        fee: {
          fixed: BigInt(100),
          basisPoints: 100
        }
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation SetFee($input: SetFeeInput!) {
              setFee(input: $input) {
                fee {
                  id
                  assetId
                  type
                  fixed
                  basisPoints
                  createdAt
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): SetFeeResponse => {
          if (query.data) {
            return query.data.setFee
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.fee).toMatchObject({
        __typename: 'Fee',
        assetId: input.assetId,
        type: input.type,
        fixed: input.fee.fixed.toString(),
        basisPoints: input.fee.basisPoints
      })
    })

    test('Returns error for unknown asset', async (): Promise<void> => {
      const input = {
        assetId: v4(),
        type: FeeType.Sending,
        fee: {
          fixed: BigInt(100),
          basisPoints: 100
        }
      }
      const gqlQuery = appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation SetFee($input: SetFeeInput!) {
              setFee(input: $input) {
                fee {
                  id
                  assetId
                  type
                  fixed
                  basisPoints
                  createdAt
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): SetFeeResponse => {
          if (query.data) {
            return query.data.setFee
          } else {
            throw new Error('Data was empty')
          }
        })

      await expect(gqlQuery).rejects.toThrow(
        new GraphQLError(errorToMessage[FeeError.UnknownAsset], {
          extensions: {
            code: errorToCode[FeeError.UnknownAsset]
          }
        })
      )
    })

    test('Returns error for invalid percent fee', async (): Promise<void> => {
      const input = {
        assetId: asset.id,
        type: FeeType.Sending,
        fee: {
          fixed: BigInt(100),
          basisPoints: -10_000
        }
      }
      const gqlQuery = appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation SetFee($input: SetFeeInput!) {
              setFee(input: $input) {
                fee {
                  id
                  assetId
                  type
                  fixed
                  basisPoints
                  createdAt
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): SetFeeResponse => {
          if (query.data) {
            return query.data.setFee
          } else {
            throw new Error('Data was empty')
          }
        })

      await expect(gqlQuery).rejects.toThrow(
        new GraphQLError(errorToMessage[FeeError.InvalidBasisPointFee], {
          extensions: {
            code: errorToCode[FeeError.InvalidBasisPointFee]
          }
        })
      )
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
          basisPoints: -10_000
        }
      }
      const gqlQuery = appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation setFee($input: SetFeeInput!) {
              setFee(input: $input) {
                fee {
                  id
                  assetId
                  type
                  fixed
                  basisPoints
                  createdAt
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): SetFeeResponse => {
          if (query.data) {
            return query.data.setFee
          } else {
            throw new Error('Data was empty')
          }
        })

      await expect(gqlQuery).rejects.toThrow(
        new GraphQLError('Unknown error', {
          extensions: {
            code: GraphQLErrorCode.InternalServerError
          }
        })
      )
    })
  })
})
