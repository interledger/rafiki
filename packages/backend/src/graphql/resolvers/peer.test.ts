import Faker from 'faker'
import { gql } from 'apollo-server-koa'
import assert from 'assert'
import Knex from 'knex'
import { v4 as uuid } from 'uuid'
import { ApolloError } from '@apollo/client'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { Peer as PeerModel } from '../../peer/model'
import { PeerService } from '../../peer/service'
import { randomAsset } from '../../tests/asset'
import { PeerFactory } from '../../tests/peerFactory'
import {
  CreatePeerInput,
  CreatePeerMutationResponse,
  Peer,
  PeersConnection,
  UpdatePeerInput,
  UpdatePeerMutationResponse
} from '../generated/graphql'

describe('Peer Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let peerFactory: PeerFactory
  let peerService: PeerService

  const randomPeer = (): CreatePeerInput => ({
    asset: randomAsset(),
    disabled: false,
    http: {
      incoming: {
        authTokens: [Faker.datatype.string(32)]
      },
      outgoing: {
        authToken: Faker.datatype.string(32),
        endpoint: Faker.internet.url()
      }
    },
    maxPacketAmount: BigInt(100),
    staticIlpAddress: 'test.' + uuid(),
    stream: {
      enabled: true
    }
  })

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      peerService = await deps.use('peerService')
      peerFactory = new PeerFactory(peerService)
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

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
                  disabled
                  maxPacketAmount
                  http {
                    outgoing {
                      authToken
                      endpoint
                    }
                  }
                  staticIlpAddress
                }
              }
            }
          `,
          variables: {
            input: peer
          }
        })
        .then(
          (query): CreatePeerMutationResponse => {
            if (query.data) {
              return query.data.createPeer
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      assert.ok(response.peer)
      delete peer.http.incoming
      await expect(peerService.get(response.peer.id)).resolves.toMatchObject({
        account: {
          disabled: peer.disabled,
          stream: peer.stream
        },
        http: peer.http,
        maxPacketAmount: peer.maxPacketAmount,
        staticIlpAddress: peer.staticIlpAddress
      })
    })

    test('Returns error for duplicate incoming token', async (): Promise<void> => {
      const incomingToken = Faker.datatype.string(32)
      await peerFactory.build({
        http: {
          incoming: {
            authTokens: [incomingToken]
          }
        }
      })
      const peer = randomPeer()
      assert.ok(peer.http.incoming)
      peer.http.incoming.authTokens.push(incomingToken)
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
        .then(
          (query): CreatePeerMutationResponse => {
            if (query.data) {
              return query.data.createPeer
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Incoming token already exists')
    })

    test('Returns error for invalid ILP address', async (): Promise<void> => {
      const peer = randomPeer()
      peer.staticIlpAddress = 'test.hello!'
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
        .then(
          (query): CreatePeerMutationResponse => {
            if (query.data) {
              return query.data.createPeer
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('400')
      expect(response.message).toEqual('Invalid ILP address')
    })
  })

  describe('Peer Queries', (): void => {
    test('Can get a peer', async (): Promise<void> => {
      const peer = await peerFactory.build(randomPeer())
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
                disabled
                maxPacketAmount
                http {
                  outgoing {
                    authToken
                    endpoint
                  }
                }
                stream {
                  enabled
                }
                staticIlpAddress
              }
            }
          `,
          variables: {
            peerId: peer.id
          }
        })
        .then(
          (query): Peer => {
            if (query.data) {
              return query.data.peer
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      assert.ok(peer.account.stream)
      expect(query).toEqual({
        __typename: 'Peer',
        id: peer.id,
        asset: {
          __typename: 'Asset',
          code: peer.account.asset.code,
          scale: peer.account.asset.scale
        },
        disabled: peer.account.disabled,
        stream: {
          __typename: 'Stream',
          enabled: peer.account.stream.enabled
        },
        http: {
          __typename: 'Http',
          outgoing: {
            __typename: 'HttpOutgoing',
            ...peer.http.outgoing
          }
        },
        staticIlpAddress: peer.staticIlpAddress,
        maxPacketAmount: peer.maxPacketAmount?.toString()
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
                disabled
                stream {
                  enabled
                }
              }
            }
          `,
          variables: {
            peerId: uuid()
          }
        })
        .then(
          (query): Peer => {
            if (query.data) {
              return query.data.peer
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      await expect(gqlQuery).rejects.toThrow(ApolloError)
    })
  })

  describe('Peers Queries', (): void => {
    async function createPeers(): Promise<PeerModel[]> {
      const peers = []
      const asset = randomAsset()
      for (let i = 0; i < 50; i++) {
        peers.push(await peerFactory.build({ asset }))
      }
      return peers
    }

    test('Can get peers', async (): Promise<void> => {
      const peers: PeerModel[] = []
      for (let i = 0; i < 2; i++) {
        peers.push(await peerFactory.build(randomPeer()))
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
                    disabled
                    maxPacketAmount
                    http {
                      outgoing {
                        authToken
                        endpoint
                      }
                    }
                    stream {
                      enabled
                    }
                    staticIlpAddress
                  }
                  cursor
                }
              }
            }
          `
        })
        .then(
          (query): PeersConnection => {
            if (query.data) {
              return query.data.peers
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query.edges).toHaveLength(2)
      query.edges.forEach((edge, idx) => {
        const peer = peers[idx]
        expect(edge.cursor).toEqual(peer.id)
        expect(edge.node).toEqual({
          __typename: 'Peer',
          id: peer.id,
          asset: {
            __typename: 'Asset',
            code: peer.account.asset.code,
            scale: peer.account.asset.scale
          },
          disabled: peer.account.disabled,
          stream: {
            __typename: 'Stream',
            enabled: peer.account.stream.enabled
          },
          http: {
            __typename: 'Http',
            outgoing: {
              __typename: 'HttpOutgoing',
              ...peer.http.outgoing
            }
          },
          staticIlpAddress: peer.staticIlpAddress,
          maxPacketAmount: peer.maxPacketAmount?.toString()
        })
      })
    })

    test('pageInfo is correct on default query without params', async (): Promise<void> => {
      const peers = await createPeers()
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Peers {
              peers {
                edges {
                  node {
                    id
                  }
                  cursor
                }
                pageInfo {
                  endCursor
                  hasNextPage
                  hasPreviousPage
                  startCursor
                }
              }
            }
          `
        })
        .then(
          (query): PeersConnection => {
            if (query.data) {
              return query.data.peers
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(20)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.pageInfo.startCursor).toEqual(peers[0].id)
      expect(query.pageInfo.endCursor).toEqual(peers[19].id)
    }, 10_000)

    test('No peers, but peers requested', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Peers {
              peers {
                edges {
                  node {
                    id
                  }
                  cursor
                }
                pageInfo {
                  endCursor
                  hasNextPage
                  hasPreviousPage
                  startCursor
                }
              }
            }
          `
        })
        .then(
          (query): PeersConnection => {
            if (query.data) {
              return query.data.peers
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(0)
      expect(query.pageInfo.hasNextPage).toBeFalsy()
      expect(query.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.pageInfo.startCursor).toBeNull()
      expect(query.pageInfo.endCursor).toBeNull()
    })

    test('pageInfo is correct on pagination from start', async (): Promise<void> => {
      const peers = await createPeers()
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Peers {
              peers(first: 10) {
                edges {
                  node {
                    id
                  }
                  cursor
                }
                pageInfo {
                  endCursor
                  hasNextPage
                  hasPreviousPage
                  startCursor
                }
              }
            }
          `
        })
        .then(
          (query): PeersConnection => {
            if (query.data) {
              return query.data.peers
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(10)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.pageInfo.startCursor).toEqual(peers[0].id)
      expect(query.pageInfo.endCursor).toEqual(peers[9].id)
    }, 10_000)

    test('pageInfo is correct on pagination from middle', async (): Promise<void> => {
      const peers = await createPeers()
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Peers($after: String!) {
              peers(after: $after) {
                edges {
                  node {
                    id
                  }
                  cursor
                }
                pageInfo {
                  endCursor
                  hasNextPage
                  hasPreviousPage
                  startCursor
                }
              }
            }
          `,
          variables: {
            after: peers[19].id
          }
        })
        .then(
          (query): PeersConnection => {
            if (query.data) {
              return query.data.peers
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(20)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.pageInfo.startCursor).toEqual(peers[20].id)
      expect(query.pageInfo.endCursor).toEqual(peers[39].id)
    }, 10_000)

    test('pageInfo is correct on pagination near end', async (): Promise<void> => {
      const peers = await createPeers()
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Peers($after: String!) {
              peers(after: $after, first: 10) {
                edges {
                  node {
                    id
                  }
                  cursor
                }
                pageInfo {
                  endCursor
                  hasNextPage
                  hasPreviousPage
                  startCursor
                }
              }
            }
          `,
          variables: {
            after: peers[44].id
          }
        })
        .then(
          (query): PeersConnection => {
            if (query.data) {
              return query.data.peers
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(5)
      expect(query.pageInfo.hasNextPage).toBeFalsy()
      expect(query.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.pageInfo.startCursor).toEqual(peers[45].id)
      expect(query.pageInfo.endCursor).toEqual(peers[49].id)
    }, 10_000)
  })

  describe('Update Peer', (): void => {
    let peer: PeerModel

    beforeEach(
      async (): Promise<void> => {
        peer = await peerFactory.build()
      }
    )

    test('Can update a peer', async (): Promise<void> => {
      const updateOptions = {
        id: peer.id,
        disabled: true,
        maxPacketAmount: '100',
        http: {
          incoming: {
            authTokens: [Faker.datatype.string(32)]
          },
          outgoing: {
            authToken: Faker.datatype.string(32),
            endpoint: Faker.internet.url()
          }
        },
        stream: {
          enabled: false
        },
        staticIlpAddress: 'g.rafiki.' + peer.id
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
                  disabled
                  maxPacketAmount
                  http {
                    outgoing {
                      authToken
                      endpoint
                    }
                  }
                  stream {
                    enabled
                  }
                  staticIlpAddress
                }
              }
            }
          `,
          variables: {
            input: updateOptions
          }
        })
        .then(
          (query): UpdatePeerMutationResponse => {
            if (query.data) {
              return query.data.updatePeer
            } else {
              throw new Error('Data was empty')
            }
          }
        )

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
        stream: {
          __typename: 'Stream',
          enabled: updateOptions.stream.enabled
        }
      })
      await expect(peerService.get(peer.id)).resolves.toMatchObject({
        account: {
          id: peer.account.id,
          asset: peer.account.asset,
          disabled: updateOptions.disabled,
          stream: updateOptions.stream
        },
        http: {
          outgoing: updateOptions.http.outgoing
        },
        maxPacketAmount: BigInt(updateOptions.maxPacketAmount),
        staticIlpAddress: updateOptions.staticIlpAddress
      })
    })

    test('Returns error for unknown peer', async (): Promise<void> => {
      const updateOptions: UpdatePeerInput = {
        id: uuid()
      }
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
            input: updateOptions
          }
        })
        .then(
          (query): UpdatePeerMutationResponse => {
            if (query.data) {
              return query.data.updatePeer
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown peer')
    })

    test('Returns error for duplicate incoming token', async (): Promise<void> => {
      const incomingToken = Faker.datatype.string(32)
      const updateOptions: UpdatePeerInput = {
        id: peer.id,
        http: randomPeer().http
      }
      assert.ok(updateOptions.http?.incoming)
      updateOptions.http.incoming.authTokens.push(incomingToken, incomingToken)
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
            input: updateOptions
          }
        })
        .then(
          (query): UpdatePeerMutationResponse => {
            if (query.data) {
              return query.data.updatePeer
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Incoming token already exists')
    })
  })
})
