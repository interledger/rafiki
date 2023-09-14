import { faker } from '@faker-js/faker'
import { gql } from '@apollo/client'
import assert from 'assert'
import nock from 'nock'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { Asset } from '../../asset/model'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import {
  errorToCode,
  errorToMessage,
  AutoPeeringError
} from '../../auto-peering/errors'
import { createAsset } from '../../tests/asset'
import { CreatePeerByUrlInput } from '../generated/graphql'
import { AutoPeeringService } from '../../auto-peering/service'

describe('Auto Peering Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let autoPeeringService: AutoPeeringService
  let asset: Asset

  const createPeerByUrlInput = (): CreatePeerByUrlInput => ({
    assetId: asset.id,
    maxPacketAmount: BigInt(100),
    peerUrl: faker.internet.url(),
    name: faker.person.fullName()
  })

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    autoPeeringService = await deps.use('autoPeeringService')
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Create Peer By Url', (): void => {
    test('Can create a peer', async (): Promise<void> => {
      const input = createPeerByUrlInput()

      const peerDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorAddress: 'http://peer-two.com',
        name: 'Test Peer',
        httpToken: 'httpToken'
      }

      const scope = nock(input.peerUrl).post('/').reply(200, peerDetails)

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeerByUrl($input: CreatePeerByUrlInput!) {
              createPeerByUrl(input: $input) {
                code
                success
                message
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
            return query.data.createPeerByUrl
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
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
            endpoint: peerDetails.ilpConnectorAddress
          }
        },
        maxPacketAmount: input.maxPacketAmount?.toString(),
        staticIlpAddress: peerDetails.staticIlpAddress,
        liquidity: '0',
        name: input.name
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
      ${AutoPeeringError.DuplicatePeer}
    `('4XX - $error', async ({ error }): Promise<void> => {
      jest
        .spyOn(autoPeeringService, 'initiatePeeringRequest')
        .mockResolvedValueOnce(error)
      const input = createPeerByUrlInput()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeerByUrl($input: CreatePeerByUrlInput!) {
              createPeerByUrl(input: $input) {
                code
                success
                message
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
            return query.data.createPeerByUrl
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toEqual(
        errorToCode[error as AutoPeeringError].toString()
      )
      expect(response.message).toEqual(
        errorToMessage[error as AutoPeeringError]
      )
    })

    test('500', async (): Promise<void> => {
      jest
        .spyOn(autoPeeringService, 'initiatePeeringRequest')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeerByUrl($input: CreatePeerByUrlInput!) {
              createPeerByUrl(input: $input) {
                code
                success
                message
                peer {
                  id
                }
              }
            }
          `,
          variables: {
            input: createPeerByUrlInput()
          }
        })
        .then((query) => {
          if (query.data) {
            return query.data.createPeerByUrl
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(response.code).toBe('500')
      expect(response.success).toBe(false)
      expect(response.message).toBe('Error trying to create peer')
    })
  })
})
