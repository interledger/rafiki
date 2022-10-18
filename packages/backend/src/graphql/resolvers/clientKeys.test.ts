import assert from 'assert'
import { gql } from 'apollo-server-koa'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { ClientService } from '../../clients/service'
import {
  AddKeyToClientInput,
  AddKeyToClientMutationResponse,
  Client,
  CreateClientInput,
  CreateClientMutationResponse,
  RevokeClientKeyMutationResponse
} from '../generated/graphql'
import { faker } from '@faker-js/faker'

const KEY_REGISTRY_ORIGIN = 'https://openpayments.network'
const TEST_CLIENT = {
  name: faker.name.firstName(),
  uri: faker.internet.url(),
  email: faker.internet.exampleEmail(),
  image: faker.image.avatar(),
  paymentPointerUrl: faker.internet.url()
}
const KEY_UUID = uuid()
const TEST_KID_PATH = '/keys/' + KEY_UUID
const TEST_CLIENT_KEY = {
  client: {
    id: uuid(),
    ...TEST_CLIENT
  },
  kid: KEY_REGISTRY_ORIGIN + TEST_KID_PATH,
  x: 'test-public-key',
  kty: 'OKP',
  alg: 'EdDSA',
  crv: 'Ed25519',
  key_ops: ['sign', 'verify'],
  use: 'sig'
}

describe('Client Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let clientService: ClientService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    clientService = await deps.use('clientService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Client Queries', (): void => {
    test('Can get a client', async (): Promise<void> => {
      const client = await clientService.createClient(TEST_CLIENT)

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Client($clientId: String!) {
              client(id: $clientId) {
                id
                name
                uri
                image
                email
                keys {
                  id
                }
                createdAt
              }
            }
          `,
          variables: {
            clientId: client.id
          }
        })
        .then((query): Client => {
          if (query.data) {
            return query.data.client
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(query).toEqual({
        __typename: 'Client',
        id: client.id,
        name: client.name,
        uri: client.uri,
        image: client.image,
        email: client.email,
        keys: [],
        createdAt: client.createdAt.toISOString()
      })
    })
  })

  describe('Create Client', (): void => {
    test('Can create a client', async (): Promise<void> => {
      const input: CreateClientInput = TEST_CLIENT
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateClient($input: CreateClientInput!) {
              createClient(input: $input) {
                code
                success
                message
                client {
                  id
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): CreateClientMutationResponse => {
          if (query.data) {
            return query.data.createClient
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      assert(response.client)
      expect(response.client).toEqual({
        __typename: 'Client',
        id: response.client.id
      })
      await expect(
        clientService.getClient(response.client.id)
      ).resolves.toMatchObject({
        id: response.client.id
      })
    })

    test('500', async (): Promise<void> => {
      jest
        .spyOn(clientService, 'createClient')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })
      const input: CreateClientInput = TEST_CLIENT
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateClient($input: CreateClientInput!) {
              createClient(input: $input) {
                code
                success
                message
                client {
                  id
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): CreateClientMutationResponse => {
          if (query.data) {
            return query.data.createClient
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(response.code).toBe('500')
      expect(response.success).toBe(false)
      expect(response.message).toBe('Error trying to create client')
    })
  })

  describe('Add Client Keys', (): void => {
    test('Can add keys to a client', async (): Promise<void> => {
      const client = await clientService.createClient(TEST_CLIENT)
      const keyWithClient = {
        ...TEST_CLIENT_KEY,
        client: {
          id: client.id,
          name: client.name,
          uri: client.uri,
          image: '',
          email: ''
        }
      }
      const input: AddKeyToClientInput = {
        id: KEY_UUID,
        clientId: client.id,
        jwk: JSON.stringify(keyWithClient)
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddKeyToClient($input: AddKeyToClientInput!) {
              addKeyToClient(input: $input) {
                code
                success
                message
                client {
                  id
                  keys {
                    id
                  }
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): AddKeyToClientMutationResponse => {
          if (query.data) {
            return query.data.addKeyToClient
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      assert(response.client)
      expect(response.client).toEqual({
        __typename: 'Client',
        id: response.client.id,
        keys: [
          {
            __typename: 'ClientKeys',
            id: KEY_UUID
          }
        ]
      })
      expect(response.client.keys).toHaveLength(1)

      await expect(
        clientService.getClient(response.client.id)
      ).resolves.toMatchObject({
        id: response.client.id
      })
    })

    test('500', async (): Promise<void> => {
      jest
        .spyOn(clientService, 'addKeyToClient')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })
      const client = await clientService.createClient(TEST_CLIENT)
      const keyWithClient = {
        ...TEST_CLIENT_KEY,
        client: {
          id: client.id,
          name: client.name,
          uri: client.uri,
          image: '',
          email: ''
        }
      }
      const input: AddKeyToClientInput = {
        id: KEY_UUID,
        clientId: client.id,
        jwk: JSON.stringify(keyWithClient)
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddKeyToClient($input: AddKeyToClientInput!) {
              addKeyToClient(input: $input) {
                code
                success
                message
                client {
                  id
                  keys {
                    id
                  }
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): AddKeyToClientMutationResponse => {
          if (query.data) {
            return query.data.addKeyToClient
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(response.code).toBe('500')
      expect(response.success).toBe(false)
      expect(response.message).toBe('Error trying to add key to client')
    })
  })

  describe('Revoke key', (): void => {
    test('Can revoke a key', async (): Promise<void> => {
      const client = await clientService.createClient(TEST_CLIENT)
      await clientService.addKeyToClient({
        id: KEY_UUID,
        clientId: client.id,
        jwk: TEST_CLIENT_KEY
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeClientKey($keyId: String!) {
              revokeClientKey(keyId: $keyId) {
                code
                success
                message
                keyId
              }
            }
          `,
          variables: {
            keyId: KEY_UUID
          }
        })
        .then((query): RevokeClientKeyMutationResponse => {
          if (query.data) {
            return query.data.revokeClientKey
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toBe('200')
      expect(response.keyId).toBe(KEY_UUID)
    })
  })
})
