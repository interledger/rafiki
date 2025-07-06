import { faker } from '@faker-js/faker'
import { ApolloError, gql } from '@apollo/client'
import assert from 'assert'
import { v4 as uuid } from 'uuid'

import { getPageTests } from './page.test'
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
  PeerError
} from '../../payment-method/ilp/peer/errors'
import { Peer as PeerModel } from '../../payment-method/ilp/peer/model'
import { PeerService } from '../../payment-method/ilp/peer/service'
import { createAsset } from '../../tests/asset'
import { createPeer } from '../../tests/peer'
import {
  Peer as GraphQLPeer,
  CreatePeerInput,
  CreatePeerMutationResponse,
  PeersConnection,
  UpdatePeerMutationResponse,
  DeletePeerMutationResponse
} from '../generated/graphql'
import { AccountingService } from '../../accounting/service'
import { GraphQLErrorCode } from '../errors'

describe('Peer Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let peerService: PeerService
  let accountingService: AccountingService
  let asset: Asset

  const randomPeer = (): CreatePeerInput => ({
    assetId: asset.id,
    http: {
      incoming: {
        authTokens: [faker.string.sample(32)]
      },
      outgoing: {
        authToken: faker.string.sample(32),
        endpoint: faker.internet.url({ appendSlash: false })
      }
    },
    maxPacketAmount: BigInt(100),
    staticIlpAddress: 'test.' + uuid(),
    name: faker.person.fullName(),
    liquidityThreshold: BigInt(100),
    initialLiquidity: BigInt(100)
  })

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    peerService = await deps.use('peerService')
    accountingService = await deps.use('accountingService')
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

  describe('Create Peer', (): void => {
    test('Can create a peer', async (): Promise<void> => {
      const peer = randomPeer()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePeer($input: CreatePeerInput!) {
              createPeer(input: $input) {
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
                  liquidityThreshold
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
        liquidity: peer.initialLiquidity?.toString(),
        name: peer.name,
        liquidityThreshold: peer.liquidityThreshold?.toString()
      })
      delete peer.http.incoming
      await expect(
        peerService.get(response.peer.id, Config.operatorTenantId)
      ).resolves.toMatchObject({
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
      ${PeerError.InvalidHTTPEndpoint}
      ${PeerError.UnknownAsset}
      ${PeerError.DuplicatePeer}
      ${PeerError.InvalidInitialLiquidity}
    `('Error - $error', async ({ error: testError }): Promise<void> => {
      jest.spyOn(peerService, 'create').mockResolvedValueOnce(testError)
      const peer = randomPeer()

      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreatePeer($input: CreatePeerInput!) {
                createPeer(input: $input) {
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
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[testError as PeerError],
            extensions: expect.objectContaining({
              code: errorToCode[testError as PeerError]
            })
          })
        )
      }
    })

    test('internal server error', async (): Promise<void> => {
      jest
        .spyOn(peerService, 'create')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })

      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreatePeer($input: CreatePeerInput!) {
                createPeer(input: $input) {
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

  describe('Peer Queries', (): void => {
    test('Can get a peer', async (): Promise<void> => {
      const peer = await createPeer(deps, randomPeer())
      const query = async () =>
        await appContainer.apolloClient
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
                  liquidity
                  name
                  liquidityThreshold
                }
              }
            `,
            variables: {
              peerId: peer.id
            }
          })
          .then((query): GraphQLPeer => {
            if (query.data) {
              return query.data.peer
            } else {
              throw new Error('Data was empty')
            }
          })

      await expect(query()).resolves.toEqual({
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
        liquidity: '0',
        name: peer.name,
        liquidityThreshold: '100'
      })

      await accountingService.createDeposit({
        id: uuid(),
        account: peer,
        amount: BigInt(100)
      })

      await expect(query()).resolves.toEqual({
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
        liquidity: '100',
        name: peer.name,
        liquidityThreshold: '100'
      })
    })

    test('Can get a peer by address and asset id', async (): Promise<void> => {
      const peer = await createPeer(deps, randomPeer())
      const args = {
        staticIlpAddress: peer.staticIlpAddress,
        assetId: peer.assetId
      }

      const query = async () =>
        await appContainer.apolloClient
          .query({
            query: gql`
              query getPeerByAddressAndAsset(
                $staticIlpAddress: String!
                $assetId: String!
              ) {
                peerByAddressAndAsset(
                  staticIlpAddress: $staticIlpAddress
                  assetId: $assetId
                ) {
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
                  liquidityThreshold
                }
              }
            `,
            variables: args
          })
          .then((query): GraphQLPeer => {
            if (query.data) {
              return query.data.peerByAddressAndAsset
            } else {
              throw new Error('Data was empty')
            }
          })

      await expect(query()).resolves.toEqual({
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
        liquidity: '0',
        name: peer.name,
        liquidityThreshold: '100'
      })

      await accountingService.createDeposit({
        id: uuid(),
        account: peer,
        amount: BigInt(100)
      })

      await expect(query()).resolves.toEqual({
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
        liquidity: '100',
        name: peer.name,
        liquidityThreshold: '100'
      })
    })

    test('Returns error for unknown peer', async (): Promise<void> => {
      expect.assertions(2)
      try {
        await appContainer.apolloClient
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
          .then((query): GraphQLPeer => {
            if (query.data) {
              return query.data.peer
            } else {
              throw new Error('Data was empty')
            }
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[PeerError.UnknownPeer],
            extensions: expect.objectContaining({
              code: errorToCode[PeerError.UnknownPeer]
            })
          })
        )
      }
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
      peers.reverse() // Calling the default getPage will result in descending order
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
                    liquidityThreshold
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
          name: peer.name,
          liquidityThreshold: '100'
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
            authTokens: [faker.string.sample(32)]
          },
          outgoing: {
            authToken: faker.string.sample(32),
            endpoint: faker.internet.url({ appendSlash: false })
          }
        },
        staticIlpAddress: 'g.rafiki.' + peer.id,
        name: faker.person.fullName(),
        liquidityThreshold: BigInt(200)
      }
      assert.ok(updateOptions.http)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdatePeer($input: UpdatePeerInput!) {
              updatePeer(input: $input) {
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
                  liquidityThreshold
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
        name: updateOptions.name,
        liquidityThreshold: '200'
      })
      await expect(
        peerService.get(peer.id, peer.tenantId)
      ).resolves.toMatchObject({
        asset: peer.asset,
        http: {
          outgoing: updateOptions.http.outgoing
        },
        maxPacketAmount: BigInt(updateOptions.maxPacketAmount),
        staticIlpAddress: updateOptions.staticIlpAddress,
        name: updateOptions.name,
        liquidityThreshold: BigInt(200)
      })
    })

    test.each`
      error
      ${PeerError.DuplicateIncomingToken}
      ${PeerError.InvalidStaticIlpAddress}
      ${PeerError.InvalidHTTPEndpoint}
      ${PeerError.UnknownPeer}
    `('Error - $error', async ({ error: testError }): Promise<void> => {
      jest.spyOn(peerService, 'update').mockResolvedValueOnce(testError)
      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation UpdatePeer($input: UpdatePeerInput!) {
                updatePeer(input: $input) {
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
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[testError as PeerError],
            extensions: expect.objectContaining({
              code: errorToCode[testError as PeerError]
            })
          })
        )
      }
    })

    test('Returns error if unexpected error', async (): Promise<void> => {
      jest.spyOn(peerService, 'update').mockImplementationOnce(async () => {
        throw new Error('unexpected')
      })

      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation UpdatePeer($input: UpdatePeerInput!) {
                updatePeer(input: $input) {
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

  describe('Delete Peer', (): void => {
    let peer: PeerModel

    beforeEach(async (): Promise<void> => {
      peer = await createPeer(deps)
    })

    test('Can delete a peer', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation DeletePeer($input: DeletePeerInput!) {
              deletePeer(input: $input) {
                success
              }
            }
          `,
          variables: {
            input: {
              id: peer.id
            }
          }
        })
        .then((query): DeletePeerMutationResponse => {
          if (query.data) {
            return query.data.deletePeer
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      await expect(
        peerService.get(peer.id, peer.tenantId)
      ).resolves.toBeUndefined()
    })

    test('Returns error for unknown peer', async (): Promise<void> => {
      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation DeletePeer($input: DeletePeerInput!) {
                deletePeer(input: $input) {
                  success
                }
              }
            `,
            variables: {
              input: {
                id: uuid()
              }
            }
          })
          .then((query): DeletePeerMutationResponse => {
            if (query.data) {
              return query.data.deletePeer
            } else {
              throw new Error('Data was empty')
            }
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[PeerError.UnknownPeer],
            extensions: expect.objectContaining({
              code: errorToCode[PeerError.UnknownPeer]
            })
          })
        )
      }
    })

    test('Returns error if unexpected error', async (): Promise<void> => {
      jest.spyOn(peerService, 'delete').mockImplementationOnce(async () => {
        throw new Error('unexpected')
      })
      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation DeletePeer($input: DeletePeerInput!) {
                deletePeer(input: $input) {
                  success
                }
              }
            `,
            variables: {
              input: {
                id: peer.id
              }
            }
          })
          .then((query): DeletePeerMutationResponse => {
            if (query.data) {
              return query.data.deletePeer
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
