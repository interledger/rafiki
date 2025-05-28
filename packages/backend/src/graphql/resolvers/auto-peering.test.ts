import { faker } from '@faker-js/faker'
import { ApolloError, gql } from '@apollo/client'
import assert from 'assert'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { Asset } from '../../asset/model'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import {
  errorToMessage,
  errorToCode,
  AutoPeeringError
} from '../../payment-method/ilp/auto-peering/errors'
import { createAsset } from '../../tests/asset'
import { CreateOrUpdatePeerByUrlInput } from '../generated/graphql'
import { AutoPeeringService } from '../../payment-method/ilp/auto-peering/service'
import { v4 as uuid } from 'uuid'
import nock from 'nock'
import { GraphQLErrorCode } from '../errors'

describe('Auto Peering Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let autoPeeringService: AutoPeeringService
  let asset: Asset

  const createOrUpdatePeerByUrlInput = (
    override?: Partial<CreateOrUpdatePeerByUrlInput>
  ): CreateOrUpdatePeerByUrlInput => ({
    assetId: asset.id,
    maxPacketAmount: BigInt(100),
    peerUrl: faker.internet.url(),
    name: faker.person.fullName(),
    ...override
  })

  const callCreateOrUpdatePeerByUrl = async (
    input: CreateOrUpdatePeerByUrlInput
  ) => {
    const response = await appContainer.apolloClient
      .mutate({
        mutation: gql`
          mutation CreateOrUpdatePeerByUrl(
            $input: CreateOrUpdatePeerByUrlInput!
          ) {
            createOrUpdatePeerByUrl(input: $input) {
              peer {
                id
                asset {
                  code
                  scale
                }
                maxPacketAmount
                http {
                  outgoing {
                    authToken
                    endpoint
                  }
                }
                staticIlpAddress
                liquidity
                name
              }
            }
          }
        `,
        variables: {
          input
        }
      })
      .then((query) => {
        if (query.data) {
          return query.data.createOrUpdatePeerByUrl
        } else {
          throw new Error('Data was empty')
        }
      })

    return response
  }

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    autoPeeringService = await deps.use('autoPeeringService')
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Create Peer By Url', (): void => {
    test('Can create a peer', async (): Promise<void> => {
      const input = createOrUpdatePeerByUrlInput({
        liquidityToDeposit: 1000n
      })

      const peerDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorUrl: 'http://peer-two.com',
        name: 'Test Peer',
        httpToken: 'httpToken',
        tenant: Config.operatorTenantId
      }

      const scope = nock(input.peerUrl).post('/').reply(200, peerDetails)

      const response = await callCreateOrUpdatePeerByUrl(input)

      assert.ok(response.peer)
      expect(response.peer).toEqual({
        __typename: 'Peer',
        id: response.peer.id,
        asset: {
          __typename: 'Asset',
          code: asset.code,
          scale: asset.scale
        },
        http: {
          __typename: 'Http',
          outgoing: {
            __typename: 'HttpOutgoing',
            authToken: expect.any(String),
            endpoint: peerDetails.ilpConnectorUrl
          }
        },
        maxPacketAmount: input.maxPacketAmount?.toString(),
        staticIlpAddress: peerDetails.staticIlpAddress,
        liquidity: input.liquidityToDeposit?.toString(),
        name: input.name
      })
      scope.done()
    })

    test('Can update a peer', async (): Promise<void> => {
      const input = createOrUpdatePeerByUrlInput({ liquidityToDeposit: 1000n })

      const peerDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorUrl: 'http://peer-two.com',
        name: 'Test Peer',
        httpToken: 'httpToken',
        tenantId: Config.operatorTenantId
      }

      const secondPeerDetails = {
        ...peerDetails,
        httpToken: uuid()
      }

      const scope = nock(input.peerUrl)
        .post('/')
        .reply(200, peerDetails)
        .post('/')
        .reply(200, secondPeerDetails)

      const response = await callCreateOrUpdatePeerByUrl(input)

      assert.ok(response.peer)
      expect(response.peer).toEqual({
        __typename: 'Peer',
        id: response.peer.id,
        asset: {
          __typename: 'Asset',
          code: asset.code,
          scale: asset.scale
        },
        http: {
          __typename: 'Http',
          outgoing: {
            __typename: 'HttpOutgoing',
            authToken: expect.any(String),
            endpoint: peerDetails.ilpConnectorUrl
          }
        },
        maxPacketAmount: input.maxPacketAmount?.toString(),
        staticIlpAddress: peerDetails.staticIlpAddress,
        liquidity: input.liquidityToDeposit?.toString(),
        name: input.name
      })

      const secondInput = createOrUpdatePeerByUrlInput({
        ...input,
        name: 'Updated Name',
        maxPacketAmount: 1000n,
        liquidityToDeposit: 2000n
      })

      const secondResponse = await callCreateOrUpdatePeerByUrl(secondInput)

      assert.ok(secondResponse.peer)
      expect(secondResponse.peer).toEqual({
        __typename: 'Peer',
        id: response.peer.id,
        asset: {
          __typename: 'Asset',
          code: asset.code,
          scale: asset.scale
        },
        http: {
          __typename: 'Http',
          outgoing: {
            __typename: 'HttpOutgoing',
            authToken: expect.any(String),
            endpoint: peerDetails.ilpConnectorUrl
          }
        },
        maxPacketAmount: secondInput.maxPacketAmount?.toString(),
        staticIlpAddress: peerDetails.staticIlpAddress,
        liquidity: (
          input.liquidityToDeposit! + secondInput.liquidityToDeposit!
        ).toString(),
        name: secondInput.name
      })

      scope.done()
    })

    test.each`
      error
      ${AutoPeeringError.InvalidIlpConfiguration}
      ${AutoPeeringError.InvalidPeerIlpConfiguration}
      ${AutoPeeringError.UnknownAsset}
      ${AutoPeeringError.PeerUnsupportedAsset}
      ${AutoPeeringError.InvalidPeerUrl}
      ${AutoPeeringError.InvalidPeeringRequest}
      ${AutoPeeringError.LiquidityError}
    `('Errors with $error', async ({ error: testError }): Promise<void> => {
      jest
        .spyOn(autoPeeringService, 'initiatePeeringRequest')
        .mockResolvedValueOnce(testError)
      const input = createOrUpdatePeerByUrlInput()
      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreateOrUpdatePeerByUrl(
                $input: CreateOrUpdatePeerByUrlInput!
              ) {
                createOrUpdatePeerByUrl(input: $input) {
                  peer {
                    id
                  }
                }
              }
            `,
            variables: {
              input
            }
          })
          .then((query) => {
            if (query.data) {
              return query.data.createOrUpdatePeerByUrl
            } else {
              throw new Error('Data was empty')
            }
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[testError as AutoPeeringError],
            extensions: expect.objectContaining({
              code: errorToCode[testError as AutoPeeringError]
            })
          })
        )
      }
    })

    test('Internal server error', async (): Promise<void> => {
      jest
        .spyOn(autoPeeringService, 'initiatePeeringRequest')
        .mockRejectedValueOnce(new Error('unexpected'))

      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreateOrUpdatePeerByUrl(
                $input: CreateOrUpdatePeerByUrlInput!
              ) {
                createOrUpdatePeerByUrl(input: $input) {
                  peer {
                    id
                  }
                }
              }
            `,
            variables: {
              input: createOrUpdatePeerByUrlInput()
            }
          })
          .then((query) => {
            if (query.data) {
              return query.data.createOrUpdatePeerByUrl
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
