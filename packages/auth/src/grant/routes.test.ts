import Knex from 'knex'
import { v4 } from 'uuid'
import * as crypto from 'crypto'
import { IocContract } from '@adonisjs/fold'
import nock from 'nock'
import jestOpenAPI from 'jest-openapi'

import { createContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { GrantRoutes } from './routes'
import { Action, AccessType } from '../access/types'
import { StartMethod, FinishMethod } from '../grant/model'
import { GrantRequest } from '../grant/service'

export const KEY_REGISTRY_ORIGIN = 'https://openpayments.network'
export const TEST_KID_PATH = '/keys/base-test-key'
export const TEST_CLIENT_DISPLAY = {
  name: 'Test Client',
  url: 'https://example.com'
}
export const TEST_CLIENT_KEY = {
  proof: 'httpsig',
  jwk: {
    kid: KEY_REGISTRY_ORIGIN + TEST_KID_PATH,
    x: 'test-public-key',
    kty: 'OKP',
    alg: 'EdDSA',
    crv: 'Ed25519',
    key_ops: ['sign', 'verify'],
    use: 'sig'
  }
}

const BASE_GRANT_ACCESS = {
  type: AccessType.IncomingPayment,
  actions: [Action.Create, Action.Read, Action.List],
  locations: ['https://example.com'],
  identifier: 'test-identifier'
}

const INCOMING_PAYMENT_LIMIT = {
  incomingAmount: {
    value: '1000000000',
    assetCode: 'usd',
    assetScale: 9
  },
  expiresAt: new Date().toISOString(),
  description: 'this is a test',
  externalRef: v4()
}

const OUTGOING_PAYMENT_LIMIT = {
  sendAmount: {
    value: '1000000000',
    assetCode: 'usd',
    assetScale: 9
  },
  receiveAmount: {
    value: '2000000000',
    assetCode: 'usd',
    assetScale: 9
  },
  expiresAt: new Date().toISOString(),
  description: 'this is a test',
  externalRef: v4(),
  receivingAccount: 'test-account',
  receivingPayment: 'test-payment'
}

const BASE_GRANT_REQUEST = {
  access_token: {
    access: [
      {
        type: AccessType.IncomingPayment,
        actions: [Action.Create, Action.Read, Action.List],
        locations: ['https://example.com'],
        identifier: 'test-identifier',
        limits: {
          incomingAmount: {
            value: '1000000000',
            assetCode: 'usd',
            assetScale: 9
          },
          expiresAt: new Date().toISOString(),
          description: 'this is a test',
          externalRef: v4()
        }
      }
    ]
  },
  client: {
    display: TEST_CLIENT_DISPLAY,
    key: TEST_CLIENT_KEY
  },
  interact: {
    start: [StartMethod.Redirect],
    finish: {
      method: FinishMethod.Redirect,
      uri: 'https://example.com/finish',
      nonce: crypto.randomBytes(8).toString('hex').toUpperCase()
    }
  }
}

describe('Grant Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let grantRoutes: GrantRoutes

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      grantRoutes = await deps.use('grantRoutes')
      knex = await deps.use('knex')
      appContainer = await createTestApp(deps)
      jestOpenAPI(await deps.use('openApi'))
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
    }
  )

  describe('Grant validation', (): void => {
    const expDate = new Date()
    expDate.setTime(expDate.getTime() + 1000 * 60 * 60)

    const nbfDate = new Date()
    nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)

    test('Valid incoming payment grant', async (): Promise<void> => {
      const incomingPaymentGrantRequest: GrantRequest = {
        ...BASE_GRANT_REQUEST,
        access_token: {
          access: [
            {
              ...BASE_GRANT_ACCESS,
              type: AccessType.IncomingPayment,
              limits: INCOMING_PAYMENT_LIMIT
            }
          ]
        }
      }

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_DISPLAY,
          keys: [
            {
              ...TEST_CLIENT_KEY.jwk,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          ]
        })
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = incomingPaymentGrantRequest

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.status).toBe(201)

      scope.isDone()
    })

    test('Valid outgoing payment grant', async (): Promise<void> => {
      const outgoingPaymentGrantRequest: GrantRequest = {
        ...BASE_GRANT_REQUEST,
        access_token: {
          access: [
            {
              ...BASE_GRANT_ACCESS,
              type: AccessType.OutgoingPayment,
              limits: OUTGOING_PAYMENT_LIMIT
            }
          ]
        }
      }

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_DISPLAY,
          keys: [
            {
              ...TEST_CLIENT_KEY.jwk,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          ]
        })
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = outgoingPaymentGrantRequest

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.status).toBe(201)

      scope.isDone()
    })

    test('Valid account grant', async (): Promise<void> => {
      const accountGrantRequest: GrantRequest = {
        ...BASE_GRANT_REQUEST,
        access_token: {
          access: [
            {
              ...BASE_GRANT_ACCESS,
              type: AccessType.Account
            }
          ]
        }
      }

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_DISPLAY,
          keys: [
            {
              ...TEST_CLIENT_KEY.jwk,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          ]
        })
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = accountGrantRequest

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.status).toBe(201)

      scope.isDone()
    })

    test('Valid quote grant', async (): Promise<void> => {
      const quoteGrantRequest: GrantRequest = {
        ...BASE_GRANT_REQUEST,
        access_token: {
          access: [
            {
              ...BASE_GRANT_ACCESS,
              type: AccessType.Quote
            }
          ]
        }
      }

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_DISPLAY,
          keys: [
            {
              ...TEST_CLIENT_KEY.jwk,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          ]
        })
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = quoteGrantRequest

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.status).toBe(201)

      scope.isDone()
    })

    test('Cannot create incoming payment grant with unexpected limit payload', async (): Promise<void> => {
      const incomingPaymentGrantRequest = {
        ...BASE_GRANT_REQUEST,
        access_token: {
          access: [
            {
              ...BASE_GRANT_ACCESS,
              type: AccessType.IncomingPayment,
              limits: OUTGOING_PAYMENT_LIMIT
            }
          ]
        }
      }

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_DISPLAY,
          keys: [
            {
              ...TEST_CLIENT_KEY.jwk,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          ]
        })
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = incomingPaymentGrantRequest

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(400)

      scope.isDone()
    })

    test('Cannot create outgoing payment grant with unexpected limit payload', async (): Promise<void> => {
      const outgoingPaymentGrantRequest = {
        ...BASE_GRANT_REQUEST,
        access_token: {
          access: [
            {
              ...BASE_GRANT_ACCESS,
              type: AccessType.OutgoingPayment,
              limits: INCOMING_PAYMENT_LIMIT
            }
          ]
        }
      }

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_DISPLAY,
          keys: [
            {
              ...TEST_CLIENT_KEY.jwk,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          ]
        })
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = outgoingPaymentGrantRequest

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(400)

      scope.isDone()
    })

    test('Cannot create account grant with unexpected limit payload', async (): Promise<void> => {
      const incomingPaymentGrantRequest = {
        ...BASE_GRANT_REQUEST,
        access_token: {
          access: [
            {
              ...BASE_GRANT_ACCESS,
              type: AccessType.Account,
              limits: OUTGOING_PAYMENT_LIMIT
            }
          ]
        }
      }

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_DISPLAY,
          keys: [
            {
              ...TEST_CLIENT_KEY.jwk,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          ]
        })
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = incomingPaymentGrantRequest

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(400)

      scope.isDone()
    })

    test('Cannot create quote grant with unexpected limit payload', async (): Promise<void> => {
      const incomingPaymentGrantRequest = {
        ...BASE_GRANT_REQUEST,
        access_token: {
          access: [
            {
              ...BASE_GRANT_ACCESS,
              type: AccessType.Quote,
              limits: OUTGOING_PAYMENT_LIMIT
            }
          ]
        }
      }

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_DISPLAY,
          keys: [
            {
              ...TEST_CLIENT_KEY.jwk,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          ]
        })
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = incomingPaymentGrantRequest

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(400)

      scope.isDone()
    })
  })

  describe('/create', (): void => {
    test('accepts json only', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'text/plain', 'Content-Type': 'application/json' },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = BASE_GRANT_REQUEST

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(406)
      expect(ctx.body).toEqual({ error: 'invalid_request' })
    })

    test('sends json body only', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json', 'Content-Type': 'text/plain' },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = BASE_GRANT_REQUEST

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(406)
      expect(ctx.body).toEqual({ error: 'invalid_request' })
    })

    test('Cannot initiate grant with invalid client', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = {
        ...BASE_GRANT_REQUEST,
        client: {
          display: TEST_CLIENT_DISPLAY,
          key: {
            proof: 'httpsig',
            jwk: {
              ...TEST_CLIENT_KEY.jwk,
              kid: 'https://openpayments.network/wrong-key'
            }
          }
        }
      }

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(400)
      expect(ctx.body).toEqual({
        error: 'invalid_client'
      })
    })

    test('Cannot initiate grant with invalid grant request', async (): Promise<void> => {
      const expDate = new Date()
      expDate.setTime(expDate.getTime() + 1000 * 60 * 60)

      const nbfDate = new Date()
      nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_DISPLAY,
          keys: [
            {
              ...TEST_CLIENT_KEY.jwk,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          ]
        })

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = {
        ...BASE_GRANT_REQUEST,
        access_token: {
          access: [
            {
              type: 'unknown-type',
              actions: [Action.Create, Action.Read, Action.List]
            }
          ]
        }
      }

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(400)
      expect(ctx.body).toEqual({
        error: 'invalid_request'
      })

      scope.isDone()
    })

    test('Can initiate a grant request', async (): Promise<void> => {
      const expDate = new Date()
      expDate.setTime(expDate.getTime() + 1000 * 60 * 60)

      const nbfDate = new Date()
      nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)

      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_DISPLAY,
          keys: [
            {
              ...TEST_CLIENT_KEY.jwk,
              exp: Math.round(expDate.getTime() / 1000),
              nbf: Math.round(nbfDate.getTime() / 1000),
              revoked: false
            }
          ]
        })
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {}
      )

      ctx.request.body = BASE_GRANT_REQUEST

      await expect(grantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.status).toBe(201)
      expect(ctx.body).toEqual({
        interact: {
          redirect: expect.any(String),
          finish: expect.any(String)
        },
        continue: {
          access_token: {
            value: expect.any(String)
          },
          uri: expect.any(String),
          wait: Config.waitTime
        }
      })

      scope.isDone()
    })
  })
})
