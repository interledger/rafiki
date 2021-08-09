import { Model } from 'objection'
import Knex, { Transaction } from 'knex'
import { createClient, Client } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { randomAsset, AccountFactory } from '../../accounts/testsHelpers'
import { AccountsService } from '../../accounts/service'
import { IlpAccount } from '../../accounts/types'
import { Logger } from '../../logger/service'
import { createKnex } from '../../Knex/service'
import { ApolloServer, gql } from 'apollo-server'

import { Config } from '../../config'
import { apolloClient as apolloClientTest } from '../testsHelpers/apolloClient'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import { createAdminApi } from '../index'
import {
  CreateIlpAccountInput,
  CreateIlpAccountMutationResponse,
  IlpAccountsConnection
} from '../generated/graphql'

const ADMIN_API_HOST = process.env.ADMIN_API_HOST || '127.0.0.1'
const ADMIN_API_PORT = parseInt(process.env.ADMIN_API_PORT || '3001', 10)

describe('Account Resolvers', (): void => {
  let accountsService: AccountsService
  let accountFactory: AccountFactory
  let config: typeof Config
  let tbClient: Client
  let adminApi: ApolloServer
  let apolloClient: ApolloClient<NormalizedCacheObject>
  let knex: Knex
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      config = Config
      config.ilpAddress = 'test.rafiki'
      config.peerAddresses = [
        {
          accountId: uuid(),
          ilpAddress: 'test.alice'
        }
      ]
      tbClient = createClient({
        cluster_id: config.tigerbeetleClusterId,
        replica_addresses: config.tigerbeetleReplicaAddresses
      })
      knex = await createKnex(config.postgresUrl)
      accountsService = new AccountsService(tbClient, config, Logger)
      accountFactory = new AccountFactory(accountsService)
      apolloClient = apolloClientTest
      adminApi = await createAdminApi({ accountsService })
      await adminApi.listen({ host: ADMIN_API_HOST, port: ADMIN_API_PORT })
    }
  )

  beforeEach(
    async (): Promise<void> => {
      trx = await knex.transaction()
      Model.knex(trx)
    }
  )

  afterEach(
    async (): Promise<void> => {
      await trx.rollback()
      await trx.destroy()
    }
  )

  afterAll(
    async (): Promise<void> => {
      await adminApi.stop()
      await knex.destroy()
      tbClient.destroy()
    }
  )

  describe('Create IlpAccount', (): void => {
    test('Can create an ilp account', async (): Promise<void> => {
      const account: CreateIlpAccountInput = {
        asset: randomAsset()
      }
      const response = await apolloClient
        .mutate({
          mutation: gql`
            mutation CreateIlpAccount($input: CreateIlpAccountInput!) {
              createIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
                  id
                }
              }
            }
          `,
          variables: {
            input: account
          }
        })
        .then(
          (query): CreateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.createIlpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.ilpAccount?.id).not.toBeNull()
      if (response.ilpAccount) {
        const expectedAccount: IlpAccount = {
          id: response.ilpAccount.id,
          asset: account.asset,
          disabled: false,
          stream: {
            enabled: false
          }
        }
        await expect(
          accountsService.getAccount(response.ilpAccount.id)
        ).resolves.toEqual(expectedAccount)
      } else {
        fail()
      }
    })

    test('Can create an ilp account with all settings', async (): Promise<void> => {
      const id = uuid()
      const account = {
        id,
        asset: randomAsset(),
        disabled: true,
        maxPacketAmount: '100',
        http: {
          incoming: {
            authTokens: [uuid()]
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        },
        stream: {
          enabled: false
        },
        routing: {
          staticIlpAddress: 'g.rafiki.' + id
        }
      }
      const response = await apolloClient
        .mutate({
          mutation: gql`
            mutation CreateIlpAccount($input: CreateIlpAccountInput!) {
              createIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
                  id
                }
              }
            }
          `,
          variables: {
            input: account
          }
        })
        .then(
          (query): CreateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.createIlpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.ilpAccount?.id).toEqual(id)
      await expect(accountsService.getAccount(id)).resolves.toEqual({
        ...account,
        http: {
          outgoing: account.http?.outgoing
        },
        maxPacketAmount: BigInt(account.maxPacketAmount)
      })
    })

    test('Returns error for duplicate account', async (): Promise<void> => {
      const { id } = await accountFactory.build()
      const account: CreateIlpAccountInput = {
        id,
        asset: randomAsset()
      }
      const response = await apolloClient
        .mutate({
          mutation: gql`
            mutation CreateIlpAccount($input: CreateIlpAccountInput!) {
              createIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
                  id
                }
              }
            }
          `,
          variables: {
            input: account
          }
        })
        .then(
          (query): CreateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.createIlpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Account already exists')
    })

    test('Returns error for duplicate incoming token', async (): Promise<void> => {
      const http = {
        incoming: {
          authTokens: [uuid()]
        },
        outgoing: {
          authToken: uuid(),
          endpoint: '/outgoingEndpoint'
        }
      }
      await accountFactory.build({ http })
      const account: CreateIlpAccountInput = {
        asset: randomAsset(),
        http
      }
      const response = await apolloClient
        .mutate({
          mutation: gql`
            mutation CreateIlpAccount($input: CreateIlpAccountInput!) {
              createIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
                  id
                }
              }
            }
          `,
          variables: {
            input: account
          }
        })
        .then(
          (query): CreateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.createIlpAccount
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

  describe('IlpAccount Queries', (): void => {
    test('Can get an ilp account', async (): Promise<void> => {
      const account = await accountFactory.build()
      const query = await apolloClient
        .query({
          query: gql`
            query IlpAccount($accountId: ID!) {
              ilpAccount(id: $accountId) {
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
            accountId: account.id
          }
        })
        .then(
          (query): Account => {
            if (query.data) {
              return query.data.ilpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query).toMatchObject(account)
    })

    test('Can get all ilp account fields', async (): Promise<void> => {
      const account = await accountFactory.build({
        maxPacketAmount: BigInt(100),
        http: {
          incoming: {
            authTokens: [uuid()]
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        },
        routing: {
          staticIlpAddress: 'g.rafiki.test'
        }
      })
      const query = await apolloClient
        .query({
          query: gql`
            query IlpAccount($accountId: ID!) {
              ilpAccount(id: $accountId) {
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
                routing {
                  staticIlpAddress
                }
              }
            }
          `,
          variables: {
            accountId: account.id
          }
        })
        .then(
          (query): Account => {
            if (query.data) {
              return query.data.ilpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query).toMatchObject({
        ...account,
        http: {
          outgoing: account.http?.outgoing
        },
        maxPacketAmount: account.maxPacketAmount?.toString()
      })
    })
  })

  describe('IlpAccounts Queries', (): void => {
    test('Can get ilp accounts', async (): Promise<void> => {
      const accounts = await Promise.all(
        Array.from({ length: 2 }, async () => await accountFactory.build())
      )
      const query = await apolloClient
        .query({
          query: gql`
            query IlpAccounts {
              ilpAccounts {
                edges {
                  node {
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
                  cursor
                }
              }
            }
          `
        })
        .then(
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query.edges).toHaveLength(2)
      query.edges.forEach((edge, idx) => {
        expect(edge.cursor).toEqual(accounts[idx].id)
        expect(edge.node).toMatchObject(accounts[idx])
      })
    })

    test('Can get all ilp accounts fields', async (): Promise<void> => {
      const accounts = await Promise.all(
        Array.from(
          { length: 2 },
          async () =>
            await accountFactory.build({
              maxPacketAmount: BigInt(100),
              http: {
                incoming: {
                  authTokens: [uuid()]
                },
                outgoing: {
                  authToken: uuid(),
                  endpoint: '/outgoingEndpoint'
                }
              },
              routing: {
                staticIlpAddress: 'g.rafiki.test'
              }
            })
        )
      )

      const query = await apolloClient
        .query({
          query: gql`
            query IlpAccounts {
              ilpAccounts {
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
                    routing {
                      staticIlpAddress
                    }
                  }
                  cursor
                }
              }
            }
          `
        })
        .then(
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query.edges).toHaveLength(2)
      query.edges.forEach((edge, idx) => {
        expect(edge.cursor).toEqual(accounts[idx].id)
        expect(edge.node).toMatchObject({
          ...accounts[idx],
          maxPacketAmount: accounts[idx].maxPacketAmount?.toString()
        })
      })
    })

    test('pageInfo is correct on default query without params', async (): Promise<void> => {
      const accounts = await Promise.all(
        Array.from({ length: 50 }, async () => await accountFactory.build())
      )
      const query = await apolloClient
        .query({
          query: gql`
            query IlpAccounts {
              ilpAccounts {
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
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(20)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.pageInfo.startCursor).toEqual(accounts[0].id)
      expect(query.pageInfo.endCursor).toEqual(accounts[19].id)
    }, 10_000)

    test('No accounts, but accounts requested', async (): Promise<void> => {
      const query = await apolloClient
        .query({
          query: gql`
            query IlpAccounts {
              ilpAccounts {
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
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
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
      const accounts = await Promise.all(
        Array.from({ length: 50 }, async () => await accountFactory.build())
      )
      const query = await apolloClient
        .query({
          query: gql`
            query IlpAccounts {
              ilpAccounts(first: 10) {
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
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(10)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.pageInfo.startCursor).toEqual(accounts[0].id)
      expect(query.pageInfo.endCursor).toEqual(accounts[9].id)
    }, 10_000)

    test('pageInfo is correct on pagination from middle', async (): Promise<void> => {
      const accounts = await Promise.all(
        Array.from({ length: 50 }, async () => await accountFactory.build())
      )
      const query = await apolloClient
        .query({
          query: gql`
            query IlpAccounts($after: String!) {
              ilpAccounts(after: $after) {
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
            after: accounts[19].id
          }
        })
        .then(
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(20)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.pageInfo.startCursor).toEqual(accounts[20].id)
      expect(query.pageInfo.endCursor).toEqual(accounts[39].id)
    }, 10_000)

    test('pageInfo is correct on pagination near end', async (): Promise<void> => {
      const accounts = await Promise.all(
        Array.from({ length: 50 }, async () => await accountFactory.build())
      )
      const query = await apolloClient
        .query({
          query: gql`
            query IlpAccounts($after: String!) {
              ilpAccounts(after: $after, first: 10) {
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
            after: accounts[44].id
          }
        })
        .then(
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(5)
      expect(query.pageInfo.hasNextPage).toBeFalsy()
      expect(query.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.pageInfo.startCursor).toEqual(accounts[45].id)
      expect(query.pageInfo.endCursor).toEqual(accounts[49].id)
    }, 10_000)
  })
})
