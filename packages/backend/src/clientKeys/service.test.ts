import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { ClientKeysService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { faker } from '@faker-js/faker'
import { ClientService } from '../clients/service'

const KEY_REGISTRY_ORIGIN = 'https://openpayments.network'
const TEST_CLIENT = {
  name: faker.name.firstName(),
  uri: faker.internet.url(),
  email: faker.internet.exampleEmail(),
  image: faker.image.avatar()
}
const KEY_UUID = uuid()
const TEST_KID_PATH = '/keys/' + KEY_UUID
const TEST_CLIENT_KEY = {
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
  let clientKeysService: ClientKeysService
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
    clientKeysService = await deps.use('clientKeysService')
    clientService = await deps.use('clientService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Fetch Client Keys', (): void => {
    test('Can fetch a key by kid', async (): Promise<void> => {
      const client = await clientService.createClient(TEST_CLIENT)
      const keyOption = {
        id: KEY_UUID,
        clientId: client.id,
        jwk: {
          ...TEST_CLIENT_KEY,
          client: {
            id: client.id,
            name: client.name,
            uri: client.uri,
            image: '',
            email: ''
          }
        }
      }
      await clientService.addKeyToClient(keyOption)
      const key = await clientKeysService.getKeyById(KEY_UUID)
      await expect(key.clientId).toEqual(client.id)
    })
  })
})
