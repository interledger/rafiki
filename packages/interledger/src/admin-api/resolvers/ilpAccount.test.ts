import { Model } from 'objection'
import Knex, { Transaction } from 'knex'
import { createClient, Client } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { AccountFactory } from '../../accounts/testsHelpers'
import { AccountsService } from '../../accounts/service'
import { Logger } from '../../logger/service'
import { createKnex } from '../../Knex/service'
import { ApolloServer, gql } from 'apollo-server'

import { Config } from '../../config'
import { apolloClient as apolloClientTest } from '../testsHelpers/apolloClient'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import { createAdminApi } from '../index'
import { IlpAccountsConnection } from '../generated/graphql'

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

  describe('IlpAccount Queries', (): void => {
    test('Can get an ilp account', async (): Promise<void> => {
      const account = await accountFactory.build()
      const query = await apolloClient
        .query({
          query: gql`
            query IlpAccount($accountId: ID!) {
              ilpAccount(id: $accountId) {
                id
              }
            }
          `,
          variables: {
            accountId: account.accountId
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

      expect(query.id).toEqual(account.accountId)
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
      expect(query.pageInfo.startCursor).toEqual(accounts[0].accountId)
      expect(query.pageInfo.endCursor).toEqual(accounts[19].accountId)
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
      expect(query.pageInfo.startCursor).toEqual(accounts[0].accountId)
      expect(query.pageInfo.endCursor).toEqual(accounts[9].accountId)
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
            after: accounts[19].accountId
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
      expect(query.pageInfo.startCursor).toEqual(accounts[20].accountId)
      expect(query.pageInfo.endCursor).toEqual(accounts[39].accountId)
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
            after: accounts[44].accountId
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
      expect(query.pageInfo.startCursor).toEqual(accounts[45].accountId)
      expect(query.pageInfo.endCursor).toEqual(accounts[49].accountId)
    }, 10_000)
  })
})
