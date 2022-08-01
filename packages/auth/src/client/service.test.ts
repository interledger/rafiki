import crypto from 'crypto'
import nock from 'nock'
import { importJWK } from 'jose'
import { v4 } from 'uuid'
import Knex, { Transaction } from 'knex'

import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { ClientService } from './service'
import { v4 } from 'uuid'
import { createContext } from '../tests/context'
import { Grant, GrantState, StartMethod, FinishMethod } from '../grant/model'
import { Access } from '../access/model'
import { AccessToken } from '../accessToken/model'
import { AccessType, Action } from '../access/types'
import { generateSigHeaders } from '../tests/signature'
import { TEST_CLIENT_KEY } from '../grant/routes.test'

const KEY_REGISTRY_ORIGIN = 'https://openpayments.network'
const TEST_CLIENT_DISPLAY = {
  name: 'Test Client',
  uri: 'https://example.com'
}

const TEST_KID_PATH = '/keys/test-key'
const TEST_CLIENT_KEY = {
  client: {
    id: v4(),
    name: TEST_CLIENT_DISPLAY.name,
    email: 'bob@bob.com',
    image: 'a link to an image',
    uri: TEST_CLIENT_DISPLAY.uri
  },
  kid: KEY_REGISTRY_ORIGIN + TEST_KID_PATH,
  x: 'hin88zzQxp79OOqIFNCME26wMiz0yqjzgkcBe0MW8pE',
  kty: 'OKP',
  alg: 'EdDSA',
  crv: 'Ed25519',
  key_ops: ['sign', 'verify'],
  use: 'sig'
}

const TEST_PRIVATE_KEY = {
  ...TEST_PUBLIC_KEY,
  d: 'v6gr9N9Nf3AUyuTgU5pk7gyNULQnzNJCBNMPp5OkiqA'
}

describe('Client Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let clientService: ClientService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    clientService = await deps.use('clientService')
    appContainer = await createTestApp(deps)
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  describe('signatures', (): void => {
    test('can verify a signature', async (): Promise<void> => {
      const challenge = 'test-challenge'
      const privateJwk = (await importJWK(TEST_PRIVATE_KEY)) as crypto.KeyLike
      const signature = crypto.sign(null, Buffer.from(challenge), privateJwk)
      const verified = await clientService.verifySig(
        signature.toString('base64'),
        TEST_PUBLIC_KEY,
        challenge
      )

      expect(verified).toBe(true)
    })

    test('can construct a challenge from signature input', (): void => {
      const sigInputHeader =
        'sig1=("@method" "@target-uri" "content-digest" "content-length" "content-type" "authorization");created=1618884473;keyid="gnap-key"'
      const ctx = createContext(
        {
          headers: {
            'Content-Type': 'application/json',
            'Content-Digest': 'sha-256=:test-hash:',
            'Content-Length': '1234',
            'Signature-Input': sigInputHeader,
            Authorization: 'GNAP test-access-token'
          }
        },
        {}
      )

      ctx.request.body = { foo: 'bar' }
      ctx.method = 'GET'
      ctx.request.url = '/test'

      const challenge = clientService.sigInputToChallenge(sigInputHeader, ctx)
      expect(challenge).toEqual(
        `"@method": GET\n"@target-uri": /test\n"content-digest": sha-256=:test-hash:\n"content-length": 1234\n"content-type": application/json\n"authorization": GNAP test-access-token\n"@signature-params": ${sigInputHeader.replace(
          'sig1=',
          ''
        )}`
      )
    })

    test('fails to construct signature input if @method is missing', (): void => {
      const sigInputHeader =
        'sig1=("@target-uri" "content-digest" "content-length" "content-type");created=1618884473;keyid="gnap-key"'
      const ctx = createContext(
        {
          headers: {
            'Content-Type': 'application/json',
            'Content-Digest': 'sha-256=:test-hash:',
            'Content-Length': '1234',
            'Signature-Input': sigInputHeader
          }
        },
        {}
      )

      ctx.request.body = { foo: 'bar' }
      ctx.method = 'GET'
      ctx.request.url = '/test'

      expect(clientService.sigInputToChallenge(sigInputHeader, ctx)).toBe(null)
    })

    test('fails to construct signature input if @target-uri is missing', (): void => {
      const sigInputHeader =
        'sig1=("@method" "content-digest" "content-length" "content-type");created=1618884473;keyid="gnap-key"'
      const ctx = createContext(
        {
          headers: {
            'Content-Type': 'application/json',
            'Content-Digest': 'sha-256=:test-hash:',
            'Content-Length': '1234',
            'Signature-Input': sigInputHeader
          }
        },
        {}
      )

      ctx.request.body = { foo: 'bar' }
      ctx.method = 'GET'
      ctx.request.url = '/test'

      expect(clientService.sigInputToChallenge(sigInputHeader, ctx)).toBe(null)
    })

    test('fails to construct signature input if request body is present but content-digest is not', (): void => {
      const sigInputHeader =
        'sig1=("@method" "@target-uri" "content-length" "content-type");created=1618884473;keyid="gnap-key"'
      const ctx = createContext(
        {
          headers: {
            'Content-Type': 'application/json',
            'Content-Digest': 'sha-256=:test-hash:',
            'Content-Length': '1234',
            'Signature-Input': sigInputHeader
          }
        },
        {}
      )

      ctx.request.body = { foo: 'bar' }
      ctx.method = 'GET'
      ctx.request.url = '/test'

      expect(clientService.sigInputToChallenge(sigInputHeader, ctx)).toBe(null)
    })

    test('fails to construct signature input if authorization header is present but not in signature input', (): void => {
      const sigInputHeader =
        'sig1=("@method" "@target-uri" "content-digest" "content-length" "content-type");created=1618884473;keyid="gnap-key"'
      const ctx = createContext(
        {
          headers: {
            'Content-Type': 'application/json',
            'Content-Digest': 'sha-256=:test-hash:',
            'Content-Length': '1234',
            'Signature-Input': sigInputHeader,
            Authorization: 'GNAP test-access-token'
          }
        },
        {}
      )

      ctx.request.body = { foo: 'bar' }
      ctx.method = 'GET'
      ctx.request.url = '/test'

      expect(clientService.sigInputToChallenge(sigInputHeader, ctx)).toBe(null)
    })
  })

  describe('Signature middleware', (): void => {
    let grant: Grant
    let token: AccessToken
    let knex: Knex
    let trx: Transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let next: () => Promise<any>
    let managementId: string
    let tokenManagementUrl: string

    const BASE_GRANT = {
      state: GrantState.Pending,
      startMethod: [StartMethod.Redirect],
      continueToken: crypto.randomBytes(8).toString('hex').toUpperCase(),
      continueId: v4(),
      finishMethod: FinishMethod.Redirect,
      finishUri: 'https://example.com/finish',
      clientNonce: crypto.randomBytes(8).toString('hex').toUpperCase(),
      clientKeyId: KEY_REGISTRY_ORIGIN + TEST_KID_PATH,
      interactId: v4(),
      interactRef: crypto.randomBytes(8).toString('hex').toUpperCase(),
      interactNonce: crypto.randomBytes(8).toString('hex').toUpperCase()
    }

    const BASE_ACCESS = {
      type: AccessType.OutgoingPayment,
      actions: [Action.Read, Action.Create],
      limits: {
        receivingAccount: 'https://wallet.com/alice',
        sendAmount: {
          value: '400',
          assetCode: 'USD',
          assetScale: 2
        }
      }
    }

    const BASE_TOKEN = {
      value: crypto.randomBytes(8).toString('hex').toUpperCase(),
      managementId: 'https://example.com/manage/12345',
      expiresIn: 3600
    }

    beforeAll(
      async (): Promise<void> => {
        knex = await deps.use('knex')
      }
    )

    beforeEach(
      async (): Promise<void> => {
        grant = await Grant.query(trx).insertAndFetch({
          ...BASE_GRANT
        })
        await Access.query(trx).insertAndFetch({
          grantId: grant.id,
          ...BASE_ACCESS
        })
        token = await AccessToken.query(trx).insertAndFetch({
          grantId: grant.id,
          ...BASE_TOKEN
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        next = jest.fn(async function (): Promise<any> {
          return null
        })

        managementId = token.managementId
        tokenManagementUrl = `/token/${managementId}`
      }
    )

    afterEach(
      async (): Promise<void> => {
        jest.useRealTimers()
        await truncateTables(knex)
      }
    )

    // afterAll(async (): Promise<void> => {
    //   nock.restore()
    // })

    test('Validate /introspect request with middleware', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          keys: [TEST_CLIENT_KEY.jwk]
        })
      const url = '/introspect'
      const method = 'POST'

      const requestBody = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }

      const { signature, sigInput, contentDigest } = await generateSigHeaders(
        url,
        method,
        requestBody
      )

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Digest': contentDigest,
            Signature: signature,
            'Signature-Input': sigInput
          },
          url,
          method
        },
        {}
      )

      ctx.request.body = requestBody
      await clientService.tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(200)

      scope.isDone()
    })

    test('Validate DEL /token request with middleware', async () => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          keys: [TEST_CLIENT_KEY.jwk]
        })
      const method = 'DELETE'

      const requestBody = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }

      const { signature, sigInput, contentDigest } = await generateSigHeaders(
        tokenManagementUrl,
        method,
        requestBody
      )

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Digest': contentDigest,
            Signature: signature,
            'Signature-Input': sigInput
          },
          url: tokenManagementUrl,
          method
        },
        { managementId }
      )

      ctx.request.body = requestBody
      await clientService.tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(200)

      scope.isDone()
    })

    test('httpsig middleware fails if client is invalid', async () => {
      const url = '/introspect'
      const method = 'POST'

      const requestBody = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }

      const { signature, sigInput, contentDigest } = await generateSigHeaders(
        tokenManagementUrl,
        method,
        requestBody
      )

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Digest': contentDigest,
            Signature: signature,
            'Signature-Input': sigInput
          },
          url,
          method
        },
        { managementId }
      )

      ctx.request.body = requestBody
      await clientService.tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(401)
    })

    test('httpsig middleware fails if headers are invalid', async () => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          keys: [TEST_CLIENT_KEY.jwk]
        })
      const method = 'DELETE'

      const requestBody = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }

      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json'
          },
          url: tokenManagementUrl,
          method
        },
        { managementId }
      )

      ctx.request.body = requestBody
      await clientService.tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(400)

      scope.isDone()
    })
  })

  describe('Registry Validation', (): void => {
    const expDate = new Date()
    expDate.setTime(expDate.getTime() + 1000 * 60 * 60)

    const nbfDate = new Date()
    nbfDate.setTime(nbfDate.getTime() - 1000 * 60 * 60)
    describe('Client Properties', (): void => {
      test('Can validate client properties with registry', async (): Promise<void> => {
        const scope = nock(KEY_REGISTRY_ORIGIN)
          .get('/keys/correct')
          .reply(200, {
            ...TEST_CLIENT_KEY,
            kid: KEY_REGISTRY_ORIGIN + '/keys/correct',
            exp: Math.round(expDate.getTime() / 1000),
            nbf: Math.round(nbfDate.getTime() / 1000),
            revoked: false
          })

        const validClient = await clientService.validateClient({
          display: TEST_CLIENT_DISPLAY,
          key: {
            proof: 'httpsig',
            jwk: {
              ...TEST_PUBLIC_KEY,
              kid: KEY_REGISTRY_ORIGIN + '/keys/correct'
            }
          }
        })

        expect(validClient).toEqual(true)
        scope.isDone()
      })

      test('Cannot validate client with incorrect display name', async (): Promise<void> => {
        const scope = nock(KEY_REGISTRY_ORIGIN)
          .get(TEST_KID_PATH)
          .reply(200, {
            ...TEST_CLIENT_KEY,
            exp: Math.round(expDate.getTime() / 1000),
            nbf: Math.round(nbfDate.getTime() / 1000),
            revoked: false
          })

        const validClient = await clientService.validateClient({
          display: { name: 'Bob', uri: TEST_CLIENT_DISPLAY.uri },
          key: {
            proof: 'httpsig',
            jwk: TEST_PUBLIC_KEY
          }
        })

        expect(validClient).toEqual(false)
        scope.isDone()
      })

      test('Cannot validate client with incorrect uri', async (): Promise<void> => {
        const scope = nock(KEY_REGISTRY_ORIGIN)
          .get(TEST_KID_PATH)
          .reply(200, {
            ...TEST_CLIENT_KEY,
            exp: Math.round(expDate.getTime() / 1000),
            nbf: Math.round(nbfDate.getTime() / 1000),
            revoked: false
          })

        const validClient = await clientService.validateClient({
          display: { name: TEST_CLIENT_DISPLAY.name, uri: 'Bob' },
          key: {
            proof: 'httpsig',
            jwk: TEST_PUBLIC_KEY
          }
        })

        expect(validClient).toEqual(false)
        scope.isDone()
      })
    })

    test('Cannot validate client with kid that doesnt resolve', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN).get('/wrong').reply(200)

      const validClientKid = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_PUBLIC_KEY,
            kid: 'https://openpayments.network/wrong'
          }
        }
      })

      expect(validClientKid).toEqual(false)
      scope.isDone()
    })

    test('Cannot validate client with jwk that doesnt have a public key', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...TEST_CLIENT_KEY,
          exp: Math.round(expDate.getTime() / 1000),
          nbf: Math.round(nbfDate.getTime() / 1000),
          revoked: false
        })

      const validClientX = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_PUBLIC_KEY,
            x: 'wrong public key'
          }
        }
      })

      expect(validClientX).toEqual(false)
      scope.isDone()
    })

    test('Cannot validate client with key that has invalid properties', async (): Promise<void> => {
      // Validate "kty"
      const validClientKty = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_PUBLIC_KEY,
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
            ...TEST_PUBLIC_KEY,
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
            ...TEST_PUBLIC_KEY,
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
            ...TEST_PUBLIC_KEY,
            crv: 'P-256'
          }
        }
      })

      expect(validClientCrv).toEqual(false)
    })

    test('Cannot validate client with key that is not ready', async (): Promise<void> => {
      const futureDate = new Date()
      futureDate.setTime(futureDate.getTime() + 1000 * 60 * 60)
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get('/keys/notready')
        .reply(200, {
          ...TEST_CLIENT_KEY,
          exp: Math.round(futureDate.getTime() / 1000),
          nbf: Math.round(futureDate.getTime() / 1000),
          revoked: false
        })

      const validKeyKid = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_PUBLIC_KEY,
            kid: KEY_REGISTRY_ORIGIN + '/keys/notready'
          }
        }
      })

      expect(validKeyKid).toEqual(false)
      scope.isDone()
    })

    test('Cannot validate client with expired key', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get('/keys/invalidclient')
        .reply(200, {
          ...TEST_CLIENT_KEY,
          exp: Math.round(nbfDate.getTime() / 1000),
          nbf: Math.round(nbfDate.getTime() / 1000),
          revoked: false
        })

      const validClient = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_PUBLIC_KEY,
            kid: KEY_REGISTRY_ORIGIN + '/keys/invalidclient'
          }
        }
      })

      expect(validClient).toEqual(false)
      scope.isDone()
    })

    test('Cannot validate client with revoked key', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get('/keys/revoked')
        .reply(200, {
          ...TEST_CLIENT_KEY,
          exp: Math.round(expDate.getTime() / 1000),
          nbf: Math.round(nbfDate.getTime() / 1000),
          revoked: true
        })

      const validClient = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...TEST_PUBLIC_KEY,
            kid: KEY_REGISTRY_ORIGIN + '/keys/revoked'
          }
        }
      })

      expect(validClient).toEqual(false)
      scope.isDone()
    })
  })
})
