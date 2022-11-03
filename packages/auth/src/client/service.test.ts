import nock from 'nock'

import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { ClientKey, ClientService, JWKWithRequired } from './service'
import { generateTestKeys, TEST_CLIENT } from '../tests/signature'
import { KEY_REGISTRY_ORIGIN } from '../grant/routes.test'

const TEST_CLIENT_DISPLAY = {
  name: 'Test Client',
  uri: 'https://example.com'
}

const TEST_KID_PATH = '/keys/test-key'

describe('Client Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let clientService: ClientService
  let keyPath: string
  let publicKey: JWKWithRequired

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    clientService = await deps.use('clientService')
    appContainer = await createTestApp(deps)

    const keys = await generateTestKeys()
    keyPath = '/' + keys.keyId
    publicKey = keys.publicKey
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  describe('Registry Validation', (): void => {
    const expDate = new Date()
    expDate.setTime(expDate.getTime() + 1000 * 60 * 60)

    const nbfDate = new Date()
    nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)
    describe('Client Properties', (): void => {
      test('Can validate client properties with registry', async (): Promise<void> => {
        nock(KEY_REGISTRY_ORIGIN)
          .get(keyPath)
          .reply(200, {
            jwk: {
              ...publicKey,
              kid: KEY_REGISTRY_ORIGIN + '/keys/correct',
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            },
            client: TEST_CLIENT
          } as ClientKey)

        const validClient = await clientService.validateClient({
          display: TEST_CLIENT_DISPLAY,
          key: {
            proof: 'httpsig',
            jwk: {
              ...publicKey,
              kid: KEY_REGISTRY_ORIGIN + keyPath
            }
          }
        })

        expect(validClient).toEqual(true)
      })

      test('Cannot validate client with incorrect display name', async (): Promise<void> => {
        nock(KEY_REGISTRY_ORIGIN)
          .get(TEST_KID_PATH)
          .reply(200, {
            jwk: {
              ...publicKey,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            },
            client: TEST_CLIENT
          } as ClientKey)

        const validClient = await clientService.validateClient({
          display: { name: 'Bob', uri: TEST_CLIENT_DISPLAY.uri },
          key: {
            proof: 'httpsig',
            jwk: publicKey
          }
        })

        expect(validClient).toEqual(false)
      })

      test('Cannot validate client with incorrect uri', async (): Promise<void> => {
        nock(KEY_REGISTRY_ORIGIN)
          .get(TEST_KID_PATH)
          .reply(200, {
            jwk: {
              ...publicKey,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            },
            client: TEST_CLIENT
          } as ClientKey)

        const validClient = await clientService.validateClient({
          display: { name: TEST_CLIENT_DISPLAY.name, uri: 'Bob' },
          key: {
            proof: 'httpsig',
            jwk: publicKey
          }
        })

        expect(validClient).toEqual(false)
      })
    })

    test('Cannot validate client with kid that doesnt resolve', async (): Promise<void> => {
      nock(KEY_REGISTRY_ORIGIN).get('/wrong').reply(200)

      const validClientKid = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            kid: 'https://openpayments.network/wrong'
          }
        }
      })

      expect(validClientKid).toEqual(false)
    })

    test('Cannot validate client with jwk that doesnt have a public key', async (): Promise<void> => {
      nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          jwk: {
            ...publicKey,
            exp: Math.round(expDate.getTime() / 1000),
            nbf: Math.round(nbfDate.getTime() / 1000),
            revoked: false
          },
          client: TEST_CLIENT
        } as ClientKey)

      const validClientX = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            x: 'wrong public key'
          }
        }
      })

      expect(validClientX).toEqual(false)
    })

    test('Cannot validate client with key that has invalid properties', async (): Promise<void> => {
      // Validate "kty"
      const validClientKty = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            kty: 'EC'
          }
        }
      })

      expect(validClientKty).toEqual(false)

      // Validate "key_ops"
      const validClientKeyOps = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            key_ops: ['wrapKey']
          }
        }
      })

      expect(validClientKeyOps).toEqual(false)

      // Validate "alg"
      const validClientAlg = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            alg: 'RS256'
          }
        }
      })

      expect(validClientAlg).toEqual(false)

      // Validate "crv"
      const validClientCrv = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            crv: 'P-256'
          }
        }
      })

      expect(validClientCrv).toEqual(false)
    })

    test('Cannot validate client with key that is not ready', async (): Promise<void> => {
      const futureDate = new Date()
      futureDate.setTime(futureDate.getTime() + 1000 * 60 * 60)
      nock(KEY_REGISTRY_ORIGIN)
        .get('/keys/notready')
        .reply(200, {
          jwk: {
            ...publicKey,
            exp: Math.round(futureDate.getTime() / 1000),
            nbf: Math.round(futureDate.getTime() / 1000),
            revoked: false
          },
          client: TEST_CLIENT
        })

      const validKeyKid = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            kid: KEY_REGISTRY_ORIGIN + '/keys/notready'
          }
        }
      })

      expect(validKeyKid).toEqual(false)
    })

    test('Cannot validate client with expired key', async (): Promise<void> => {
      nock(KEY_REGISTRY_ORIGIN)
        .get('/keys/invalidclient')
        .reply(200, {
          jwk: {
            ...publicKey,
            exp: Math.round(nbfDate.getTime() / 1000),
            nbf: Math.round(nbfDate.getTime() / 1000),
            revoked: false
          },
          client: TEST_CLIENT
        } as ClientKey)

      const validClient = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            kid: KEY_REGISTRY_ORIGIN + '/keys/invalidclient'
          }
        }
      })

      expect(validClient).toEqual(false)
    })

    test('Cannot validate client with revoked key', async (): Promise<void> => {
      nock(KEY_REGISTRY_ORIGIN)
        .get('/keys/revoked')
        .reply(200, {
          jwk: {
            ...publicKey,
            exp: Math.round(expDate.getTime() / 1000),
            nbf: Math.round(nbfDate.getTime() / 1000),
            revoked: true
          },
          client: TEST_CLIENT
        } as ClientKey)

      const validClient = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            kid: KEY_REGISTRY_ORIGIN + '/keys/revoked'
          }
        }
      })

      expect(validClient).toEqual(false)
    })
  })
})
