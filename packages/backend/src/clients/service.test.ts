import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { ClientService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { faker } from '@faker-js/faker'

const KEY_REGISTRY_ORIGIN = 'https://openpayments.network'
const TEST_CLIENT = {
  name: faker.name.firstName(),
  paymentPointerUrl: faker.internet.url(),
  uri: faker.internet.url(),
  email: faker.internet.exampleEmail(),
  image: faker.image.avatar()
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

describe('Client Key Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let clientService: ClientService
  let knex: Knex
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    deps.bind('messageProducer', async () => mockMessageProducer)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    clientService = await deps.use('clientService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create or Get Client', (): void => {
    test('Client can be created', async (): Promise<void> => {
      const Client = await clientService.createClient(TEST_CLIENT)
      await expect(Client.name).toEqual(TEST_CLIENT.name)
      await expect(Client.uri).toEqual(TEST_CLIENT.uri)
    })
    test('Can get client (with empty keys)', async (): Promise<void> => {
      const Client = await clientService.createClient(TEST_CLIENT)

      const fetchedClient = await clientService.getClient(Client.id)
      await expect(fetchedClient.id).toEqual(Client.id)
      await expect(fetchedClient.name).toEqual(Client.name)
      await expect(fetchedClient.uri).toEqual(Client.uri)
      await expect(fetchedClient.keys).toHaveLength(0)
    })
  })
  describe('Manage Client Keys', (): void => {
    test('Can add a key to a client', async (): Promise<void> => {
      let client = await clientService.createClient(TEST_CLIENT)
      const keyOption = {
        id: uuid(),
        clientId: client.id,
        jwk: {
          ...TEST_CLIENT_KEY,
          client: {
            id: client.id,
            ...TEST_CLIENT
          }
        }
      }

      await expect(client.keys).toBeUndefined()

      client = await clientService.addKeyToClient(keyOption)
      await expect(client.keys[0].id).toEqual(keyOption.id)
      await expect(client.keys[0].clientId).toEqual(client.id)
      await expect(client.keys).toHaveLength(1)
    })
  })
})
