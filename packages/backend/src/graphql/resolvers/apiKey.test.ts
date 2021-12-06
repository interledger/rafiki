import { gql } from 'apollo-server-koa'
import Knex from 'knex'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { AccountService } from '../../open_payments/account/service'
import { randomAsset } from '../../tests/asset'
import {
  CreateApiKeyInput,
  CreateApiKeyMutationResponse,
  DeleteAllApiKeysInput,
  DeleteAllApiKeysMutationResponse,
  RedeemApiKeyInput,
  RedeemApiKeyMutationResponse
} from '../generated/graphql'
import { ApiKeyService } from '../../apiKey/service'
import bcrypt from 'bcrypt'
import { SessionService } from '../../session/service'
describe('ApiKey Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let accountService: AccountService
  let apiKeyService: ApiKeyService
  let sessionService: SessionService

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      accountService = await deps.use('accountService')
      apiKeyService = await deps.use('apiKeyService')
      sessionService = await deps.use('sessionService')
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

  describe('Api Key Mutations', (): void => {
    test('Api key can be created', async (): Promise<void> => {
      const { id: accountId } = await accountService.create({
        asset: randomAsset()
      })

      const input: CreateApiKeyInput = { accountId }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateApiKey($input: CreateApiKeyInput!) {
              createApiKey(input: $input) {
                code
                success
                message
                apiKey {
                  id
                  accountId
                  key
                  createdAt
                  updatedAt
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then(
          (query): CreateApiKeyMutationResponse => {
            if (query.data) {
              return query.data.createApiKey
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.apiKey?.id).not.toBeNull()
      expect(response.apiKey?.accountId).not.toBeNull()
      expect(response.apiKey?.key).not.toBeNull()
      expect(response.apiKey?.createdAt).not.toBeNull()
      expect(response.apiKey?.updatedAt).not.toBeNull()
      if (response.apiKey) {
        const apiKeys = await apiKeyService.get(input)
        expect(response.apiKey.id).toEqual(apiKeys[0].id)
        expect(response.apiKey.accountId).toEqual(apiKeys[0].accountId)
        expect(response.apiKey.createdAt).toEqual(
          new Date(apiKeys[0].createdAt).toISOString()
        )
        expect(response.apiKey.updatedAt).toEqual(
          new Date(apiKeys[0].updatedAt).toISOString()
        )
        await expect(
          bcrypt.compare(response.apiKey.key, apiKeys[0].hashedKey)
        ).resolves.toBe(true)
      } else {
        fail()
      }
    })

    test('API Key can be redeemed', async (): Promise<void> => {
      const { id: accountId } = await accountService.create({
        asset: randomAsset()
      })
      const apiKey = await apiKeyService.create({ accountId })
      const input: RedeemApiKeyInput = {
        accountId,
        key: apiKey.key
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation RedeemApiKey($input: RedeemApiKeyInput!) {
              redeemApiKey(input: $input) {
                code
                success
                message
                session {
                  key
                  expiresAt
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then(
          (query): RedeemApiKeyMutationResponse => {
            if (query.data) {
              return query.data.redeemApiKey
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.session?.key).not.toBeNull()
      expect(response.session?.expiresAt).not.toBeNull()
      if (response.session) {
        const session = await sessionService.get({
          key: response.session.key
        })
        if (!session) {
          fail()
        } else {
          expect(Number(response.session.expiresAt)).toEqual(
            session.expiresAt.getTime()
          )
        }
      } else {
        fail()
      }
    })

    test('Api keys can be deleted', async (): Promise<void> => {
      const { id: accountId } = await accountService.create({
        asset: randomAsset()
      })
      await apiKeyService.create({ accountId })
      const input: DeleteAllApiKeysInput = { accountId }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation DeleteAllApiKeys($input: DeleteAllApiKeysInput!) {
              deleteAllApiKeys(input: $input) {
                code
                success
                message
              }
            }
          `,
          variables: {
            input
          }
        })
        .then(
          (query): DeleteAllApiKeysMutationResponse => {
            if (query.data) {
              return query.data.deleteAllApiKeys
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
    })
  })
})
