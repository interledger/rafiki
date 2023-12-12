import { faker } from '@faker-js/faker'
import nock from 'nock'
import { JWK, generateTestKeys } from '@interledger/http-signature-utils'

import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { ClientService } from './service'

const TEST_CLIENT_DISPLAY = {
  name: 'Test Client',
  uri: 'https://example.com'
}

describe('Client Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let clientService: ClientService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    clientService = await deps.use('clientService')
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('can retrieve client display info', async (): Promise<void> => {
      const scope = nock(TEST_CLIENT_DISPLAY.uri)
        .get('/')
        .reply(200, {
          id: TEST_CLIENT_DISPLAY.uri,
          publicName: TEST_CLIENT_DISPLAY.name,
          assetCode: 'USD',
          assetScale: 9,
          authServer: faker.internet.url({ appendSlash: false }),
          resourceServer: faker.internet.url({ appendSlash: false })
        })

      await expect(clientService.get(TEST_CLIENT_DISPLAY.uri)).resolves.toEqual(
        TEST_CLIENT_DISPLAY
      )

      scope.done()
    })

    test.each([400, 500])(
      'cannot retrieve display info from unsuccessful request',
      async (status: number): Promise<void> => {
        const scope = nock(TEST_CLIENT_DISPLAY.uri).get('/').reply(status)

        await expect(
          clientService.get(TEST_CLIENT_DISPLAY.uri)
        ).resolves.toBeUndefined()

        scope.done()
      }
    )

    test('cannot retrieve display info from invalid client', async (): Promise<void> => {
      const scope = nock(TEST_CLIENT_DISPLAY.uri).get('/').reply(200, {
        'bad news': 'not a client'
      })

      await expect(
        clientService.get(TEST_CLIENT_DISPLAY.uri)
      ).resolves.toBeUndefined()

      scope.done()
    })

    test('cannot retrieve display if missing public name', async (): Promise<void> => {
      const scope = nock(TEST_CLIENT_DISPLAY.uri)
        .get('/')
        .reply(200, {
          id: TEST_CLIENT_DISPLAY.uri,
          assetCode: 'USD',
          assetScale: 9,
          authServer: faker.internet.url({ appendSlash: false })
        })

      await expect(
        clientService.get(TEST_CLIENT_DISPLAY.uri)
      ).resolves.toBeUndefined()

      scope.done()
    })
  })

  describe('getKeys', (): void => {
    const keys: JWK[] = []

    beforeAll((): void => {
      for (let i = 0; i < 3; i++) {
        keys.push(generateTestKeys().publicKey)
      }
    })

    test.each([0, 1, 2])(
      'can retrieve key from client jwks (%i)',
      async (i: number): Promise<void> => {
        const client = faker.internet.url({ appendSlash: false })
        const key = keys[i]
        const scope = nock(client).get('/jwks.json').reply(200, {
          keys
        })

        await expect(
          clientService.getKey({
            client,
            keyId: key.kid
          })
        ).resolves.toEqual(key)

        scope.done()
      }
    )

    test('cannot retrieve unknown key id', async (): Promise<void> => {
      const client = faker.internet.url({ appendSlash: false })
      const scope = nock(client).get('/jwks.json').reply(200, {
        keys
      })

      await expect(
        clientService.getKey({
          client,
          keyId: 'unknown'
        })
      ).resolves.toBeUndefined()

      scope.done()
    })

    test.each([400, 500])(
      'cannot retrieve key from unsuccessful request',
      async (status: number): Promise<void> => {
        const client = faker.internet.url({ appendSlash: false })
        const scope = nock(client).get('/jwks.json').reply(status)

        await expect(
          clientService.getKey({
            client,
            keyId: 'no chance'
          })
        ).resolves.toBeUndefined()

        scope.done()
      }
    )

    test('cannot retrieve key from invalid client jwks', async (): Promise<void> => {
      const client = faker.internet.url({ appendSlash: false })
      const scope = nock(client).get('/jwks.json').reply(200, {
        'bad news': 'no keys here'
      })

      await expect(
        clientService.getKey({
          client,
          keyId: 'no chance'
        })
      ).resolves.toBeUndefined()

      scope.done()
    })
  })
})
