import nock from 'nock'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { ClientService } from './service'

const KEY_REGISTRY_ORIGIN = 'https://openpayments.network'
const TEST_CLIENT_DISPLAY = {
  name: 'Test Client',
  uri: 'https://example.com'
}

const TEST_KID_PATH = '/keys/test-key'
const TEST_CLIENT_KEY = {
  kid: KEY_REGISTRY_ORIGIN + TEST_KID_PATH,
  x: 'test-public-key',
  kty: 'OKP',
  alg: 'EdDSA',
  crv: 'Ed25519',
  key_ops: ['sign', 'verify'],
  use: 'sig'
}

describe('Client Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let clientService: ClientService

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      clientService = await deps.use('clientService')
      appContainer = await createTestApp(deps)
    }
  )

  afterEach(
    async (): Promise<void> => {
      nock.cleanAll()
    }
  )

  afterAll(
    async (): Promise<void> => {
      nock.restore()
      await appContainer.shutdown()
    }
  )

  describe('Registry Validation', (): void => {
    describe('Client Properties', (): void => {
      test('Can validate client properties with registry', async (): Promise<void> => {
        const expDate = new Date()
        expDate.setTime(expDate.getTime() + 1000 * 60 * 60)

        const nbfDate = new Date()
        nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)
        nock(KEY_REGISTRY_ORIGIN)
          .get('/keys/correct')
          .reply(200, {
            display: TEST_CLIENT_DISPLAY,
            keys: {
              ...TEST_CLIENT_KEY,
              kid: KEY_REGISTRY_ORIGIN + '/keys/correct',
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          })

        const validClient = await clientService.validateClientWithRegistry({
          display: TEST_CLIENT_DISPLAY,
          key: {
            proof: 'httpsig',
            jwk: {
              ...TEST_CLIENT_KEY,
              kid: KEY_REGISTRY_ORIGIN + '/keys/correct'
            }
          }
        })

        expect(validClient).toEqual(true)
      })

      test('Cannot validate client with incorrect display name', async (): Promise<void> => {
        const expDate = new Date()
        expDate.setTime(expDate.getTime() + 1000 * 60 * 60)

        const nbfDate = new Date()
        nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)
        nock(KEY_REGISTRY_ORIGIN)
          .get(TEST_KID_PATH)
          .reply(200, {
            display: {
              name: 'Wrong Client',
              uri: 'https://example.com'
            },
            keys: {
              ...TEST_CLIENT_KEY,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          })

        const validClient = await clientService.validateClientWithRegistry({
          display: TEST_CLIENT_DISPLAY,
          key: {
            proof: 'httpsig',
            jwk: TEST_CLIENT_KEY
          }
        })

        expect(validClient).toEqual(false)
      })

      test('Cannot validate client with incorrect uri', async (): Promise<void> => {
        const expDate = new Date()
        expDate.setTime(expDate.getTime() + 1000 * 60 * 60)
        const nbfDate = new Date()
        nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)
        nock(KEY_REGISTRY_ORIGIN)
          .get(TEST_KID_PATH)
          .reply(200, {
            display: {
              name: 'Test Client',
              uri: 'https://example.com/wrong'
            },
            keys: {
              ...TEST_CLIENT_KEY,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          })

        const validClient = await clientService.validateClientWithRegistry({
          display: TEST_CLIENT_DISPLAY,
          key: {
            proof: 'httpsig',
            jwk: TEST_CLIENT_KEY
          }
        })

        expect(validClient).toEqual(false)
      })
    })

    test('Cannot validate client with key that has invalid properties', async (): Promise<void> => {
      const futureDate = new Date()
      futureDate.setTime(futureDate.getTime() + 1000 * 60 * 60)
      const nbfDate = new Date()
      nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)
      nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          display: TEST_CLIENT_DISPLAY,
          keys: {
            ...TEST_CLIENT_KEY,
            exp: Math.round(futureDate.getTime() / 1000),
            nbf: Math.round(nbfDate.getTime() / 1000),
            revoked: false
          }
        })

      nock(KEY_REGISTRY_ORIGIN).get('/wrong').reply(200)

      // Validate kid
      const validClientKid = await clientService.validateClientWithRegistry({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_CLIENT_KEY,
            kid: 'https://openpayments.network/wrong'
          }
        }
      })

      expect(validClientKid).toEqual(false)

      // Validate "kty"
      const validClientKty = await clientService.validateClientWithRegistry({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_CLIENT_KEY,
            kty: 'EC'
          }
        }
      })

      expect(validClientKty).toEqual(false)

      // Validate "key_ops"
      const validClientKeyOps = await clientService.validateClientWithRegistry({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_CLIENT_KEY,
            key_ops: ['wrapKey']
          }
        }
      })

      expect(validClientKeyOps).toEqual(false)

      // Validate "x"
      const validClientX = await clientService.validateClientWithRegistry({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_CLIENT_KEY,
            x: 'wrong public key'
          }
        }
      })

      expect(validClientX).toEqual(false)

      // Validate "alg"
      const validClientAlg = await clientService.validateClientWithRegistry({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_CLIENT_KEY,
            alg: 'RS256'
          }
        }
      })

      expect(validClientAlg).toEqual(false)

      // Validate "crv"
      const validClientCrv = await clientService.validateClientWithRegistry({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_CLIENT_KEY,
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
        .get(TEST_KID_PATH)
        .reply(200, {
          display: TEST_CLIENT_DISPLAY,
          keys: {
            ...TEST_CLIENT_KEY,
            exp: Math.round(futureDate.getTime() / 1000),
            nbf: Math.round(futureDate.getTime() / 1000),
            revoked: false
          }
        })

      const validKeyKid = await clientService.validateClientWithRegistry({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: TEST_CLIENT_KEY
        }
      })

      expect(validKeyKid).toEqual(false)
    })

    test('Cannot validate client with expired key', async (): Promise<void> => {
      const expDate = new Date()
      expDate.setTime(expDate.getTime() - 1000 * 60 * 60)
      const nbfDate = new Date()
      nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)
      nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          display: TEST_CLIENT_DISPLAY,
          keys: {
            ...TEST_CLIENT_KEY,
            exp: Math.round(expDate.getTime() / 1000),
            nbf: Math.round(nbfDate.getTime() / 1000),
            revoked: false
          }
        })

      const validClient = await clientService.validateClientWithRegistry({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: TEST_CLIENT_KEY
        }
      })

      expect(validClient).toEqual(false)
    })

    test('Cannot validate client with revoked key', async (): Promise<void> => {
      const expDate = new Date()
      expDate.setTime(expDate.getTime() + 1000 * 60 * 60)

      const nbfDate = new Date()
      nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)
      nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          display: TEST_CLIENT_DISPLAY,
          keys: {
            ...TEST_CLIENT_KEY,
            exp: Math.round(expDate.getTime() / 1000),
            nbf: Math.round(nbfDate.getTime() / 1000),
            revoked: true
          }
        })

      const validClient = await clientService.validateClientWithRegistry({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: TEST_CLIENT_KEY
        }
      })

      expect(validClient).toEqual(false)
    })
  })
})
