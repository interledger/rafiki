import { faker } from '@faker-js/faker'
import { gql } from 'apollo-server-koa'
import assert from 'assert'
import { v4 as uuid } from 'uuid'
import { ApolloError } from '@apollo/client'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { Asset } from '../../asset/model'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { errorToCode, errorToMessage, PeerError } from '../../peer/errors'
import { Peer as PeerModel } from '../../peer/model'
import { PeerService } from '../../peer/service'
import { createAsset } from '../../tests/asset'
import { createPeer } from '../../tests/peer'
import {
  CreatePeerInput,
  CreatePeerMutationResponse,
  Peer,
  PeersConnection,
  UpdatePeerMutationResponse
} from '../generated/graphql'

describe('Peer Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let peerService: PeerService
  let asset: Asset

  const randomPeer = (): CreatePeerInput => ({
    assetId: asset.id,
    http: {
      incoming: {
        authTokens: [faker.datatype.string(32)]
      },
      outgoing: {
        authToken: faker.datatype.string(32),
        endpoint: faker.internet.url()
      }
    },
    maxPacketAmount: BigInt(100),
    staticIlpAddress: 'test.' + uuid(),
    name: faker.name.fullName()
  })

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    peerService = await deps.use('peerService')
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Create Peer', (): void => {
    test('Can create a peer', async (): Promise<void> => {
      const peer = randomPeer()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeer($input: CreatePeerInput!) {
              createPeer(input: $input) {
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
                  name
                }
              }
            }
          `,
          variables: {
            input: peer
          }
        })
        .then((query): CreatePeerMutationResponse => {
          if (query.data) {
            return query.data.createPeer
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
            ...peer.http.outgoing
          }
        },
        maxPacketAmount: peer.maxPacketAmount?.toString(),
        staticIlpAddress: peer.staticIlpAddress,
        name: peer.name
      })
      delete peer.http.incoming
      await expect(peerService.get(response.peer.id)).resolves.toMatchObject({
        asset,
        http: peer.http,
        maxPacketAmount: peer.maxPacketAmount,
        staticIlpAddress: peer.staticIlpAddress,
        name: peer.name
      })
    })

    test.each`
      error
      ${PeerError.DuplicateIncomingToken}
      ${PeerError.InvalidStaticIlpAddress}
      ${PeerError.UnknownAsset}
    `('4XX - $error', async ({ error }): Promise<void> => {
      jest.spyOn(peerService, 'create').mockResolvedValueOnce(error)
      const peer = randomPeer()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeer($input: CreatePeerInput!) {
              createPeer(input: $input) {
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
            input: peer
          }
        })
        .then((query): CreatePeerMutationResponse => {
          if (query.data) {
            return query.data.createPeer
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toEqual(errorToCode[error].toString())
      expect(response.message).toEqual(errorToMessage[error])
    })

    test('500', async (): Promise<void> => {
      jest
        .spyOn(peerService, 'create')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeer($input: CreatePeerInput!) {
              createPeer(input: $input) {
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
            input: randomPeer()
          }
        })
        .then((query): CreatePeerMutationResponse => {
          if (query.data) {
            return query.data.createPeer
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(response.code).toBe('500')
      expect(response.success).toBe(false)
      expect(response.message).toBe('Error trying to create peer')
    })
  })

  describe('Peer Queries', (): void => {
    test('Can get a peer', async (): Promise<void> => {
      const peer = await createPeer(deps, randomPeer())
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Peer($peerId: String!) {
              peer(id: $peerId) {
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
                name
              }
            }
          `,
          variables: {
            peerId: peer.id
          }
        })
        .then((query): Peer => {
          if (query.data) {
            return query.data.peer
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(query).toEqual({
        __typename: 'Peer',
        id: peer.id,
        asset: {
          __typename: 'Asset',
          code: peer.asset.code,
          scale: peer.asset.scale
        },
        http: {
          __typename: 'Http',
          outgoing: {
            __typename: 'HttpOutgoing',
            ...peer.http.outgoing
          }
        },
        staticIlpAddress: peer.staticIlpAddress,
        maxPacketAmount: peer.maxPacketAmount?.toString(),
        name: peer.name
      })
    })

    test('Returns error for unknown peer', async (): Promise<void> => {
      const gqlQuery = appContainer.apolloClient
        .query({
          query: gql`
            query Peer($peerId: String!) {
              peer(id: $peerId) {
                id
                asset {
                  code
                  scale
                }
              }
            }
          `,
          variables: {
            peerId: uuid()
          }
        })
        .then((query): Peer => {
          if (query.data) {
            return query.data.peer
          } else {
            throw new Error('Data was empty')
          }
        })

      await expect(gqlQuery).rejects.toThrow(ApolloError)
    })
  })

  describe('Peers Queries', (): void => {
    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () => createPeer(deps),
      pagedQuery: 'peers'
    })

    test('Can get peers', async (): Promise<void> => {
      const peers: PeerModel[] = []
      for (let i = 0; i < 2; i++) {
        peers.push(await createPeer(deps, randomPeer()))
      }
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Peers {
              peers {
                edges {
                  node {
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
                    name
                  }
                  cursor
                }
              }
            }
          `
        })
        .then((query): PeersConnection => {
          if (query.data) {
            return query.data.peers
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(query.edges).toHaveLength(2)
      query.edges.forEach((edge, idx) => {
        const peer = peers[idx]
        expect(edge.cursor).toEqual(peer.id)
        expect(edge.node).toEqual({
          __typename: 'Peer',
          id: peer.id,
          asset: {
            __typename: 'Asset',
            code: peer.asset.code,
            scale: peer.asset.scale
          },
          http: {
            __typename: 'Http',
            outgoing: {
              __typename: 'HttpOutgoing',
              ...peer.http.outgoing
            }
          },
          staticIlpAddress: peer.staticIlpAddress,
          maxPacketAmount: peer.maxPacketAmount?.toString(),
          name: peer.name
        })
      })
    })
  })

  describe('Update Peer', (): void => {
    let peer: PeerModel

    beforeEach(async (): Promise<void> => {
      peer = await createPeer(deps)
    })

    test('Can update a peer', async (): Promise<void> => {
      const updateOptions = {
        id: peer.id,
        maxPacketAmount: '100',
        http: {
          incoming: {
            authTokens: [faker.datatype.string(32)]
          },
          outgoing: {
            authToken: faker.datatype.string(32),
            endpoint: faker.internet.url()
          }
        },
        staticIlpAddress: 'g.rafiki.' + peer.id,
        name: faker.name.fullName()
      }
      assert.ok(updateOptions.http)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdatePeer($input: UpdatePeerInput!) {
              updatePeer(input: $input) {
                code
                success
                message
                peer {
                  id
                  maxPacketAmount
                  http {
                    outgoing {
                      authToken
                      endpoint
                    }
                  }
                  staticIlpAddress
                  name
                }
              }
            }
          `,
          variables: {
            input: updateOptions
          }
        })
        .then((query): UpdatePeerMutationResponse => {
          if (query.data) {
            return query.data.updatePeer
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.peer).toEqual({
        __typename: 'Peer',
        ...updateOptions,
        http: {
          __typename: 'Http',
          outgoing: {
            __typename: 'HttpOutgoing',
            ...updateOptions.http.outgoing
          }
        },
        staticIlpAddress: updateOptions.staticIlpAddress,
        name: updateOptions.name
      })
      await expect(peerService.get(peer.id)).resolves.toMatchObject({
        asset: peer.asset,
        http: {
          outgoing: updateOptions.http.outgoing
        },
        maxPacketAmount: BigInt(updateOptions.maxPacketAmount),
        staticIlpAddress: updateOptions.staticIlpAddress,
        name: updateOptions.name
      })
    })

    test.each`
      error
      ${PeerError.DuplicateIncomingToken}
      ${PeerError.InvalidStaticIlpAddress}
      ${PeerError.UnknownPeer}
    `('4XX - $error', async ({ error }): Promise<void> => {
      jest.spyOn(peerService, 'update').mockResolvedValueOnce(error)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdatePeer($input: UpdatePeerInput!) {
              updatePeer(input: $input) {
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
            input: {
              id: peer.id,
              maxPacketAmount: '100'
            }
          }
        })
        .then((query): UpdatePeerMutationResponse => {
          if (query.data) {
            return query.data.updatePeer
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toEqual(errorToCode[error].toString())
      expect(response.message).toEqual(errorToMessage[error])
    })
  })
})
