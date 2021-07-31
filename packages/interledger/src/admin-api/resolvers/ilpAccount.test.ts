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
import { IlpAccount } from '../../accounts/types'
import { apolloClient as apolloClientTest } from '../testsHelpers/apolloClient'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import { createAdminApi } from '../index'

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
    let account: IlpAccount

    beforeEach(
      async (): Promise<void> => {
        account = await accountFactory.build()
      }
    )

    test('Can get an ilp account', async (): Promise<void> => {
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
  })
})
