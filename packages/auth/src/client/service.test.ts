import crypto from 'crypto'
import nock from 'nock'
import { importJWK } from 'jose'
import { v4 } from 'uuid'
import { Knex } from 'knex'

import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { v4 } from 'uuid'
import { ClientService, JWKWithRequired } from './service'
import { createContext, createContextWithSigHeaders } from '../tests/context'
import { generateTestKeys } from '../tests/signature'
import { Grant, GrantState, StartMethod, FinishMethod } from '../grant/model'
import { Access } from '../access/model'
import { AccessToken } from '../accessToken/model'
import { AccessType, Action } from '../access/types'
import { KID_ORIGIN } from '../grant/routes.test'

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
  let privateKey: JWKWithRequired
  let testClientKey: {
    proof: string
    jwk: JWKWithRequired
  }

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    clientService = await deps.use('clientService')
    appContainer = await createTestApp(deps)

    const keys = await generateTestKeys()
    keyPath = '/' + keys.keyId
    publicKey = keys.publicKey
    privateKey = keys.privateKey
    testClientKey = {
      proof: 'httpsig',
      jwk: publicKey
    }
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  describe('signatures', (): void => {
    test('can verify a signature', async (): Promise<void> => {
      const challenge = 'test-challenge'
      const privateJwk = (await importJWK(privateKey)) as crypto.KeyLike
      const signature = crypto.sign(null, Buffer.from(challenge), privateJwk)
      await expect(
        clientService.verifySig(
          signature.toString('base64'),
          publicKey,
          challenge
        )
      ).resolves.toBe(true)
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
          },
          method: 'GET',
          url: '/test'
        },
        {}
      )

      ctx.request.body = { foo: 'bar' }

      const challenge = clientService.sigInputToChallenge(sigInputHeader, ctx)
      expect(challenge).toEqual(
        `"@method": GET\n"@target-uri": /test\n"content-digest": sha-256=:test-hash:\n"content-length": 1234\n"content-type": application/json\n"authorization": GNAP test-access-token\n"@signature-params": ${sigInputHeader.replace(
          'sig1=',
          ''
        )}`
      )
    })

    test.each`
      title                                                                               | sigInputHeader
      ${'fails if a component is not in lower case'}                                      | ${'sig1=("@METHOD" "@target-uri" "content-digest" "content-length" "content-type" "authorization");created=1618884473;keyid="gnap-key"'}
      ${'fails @method is missing'}                                                       | ${'sig1=("@target-uri" "content-digest" "content-length" "content-type");created=1618884473;keyid="gnap-key"'}
      ${'fails if @target-uri is missing'}                                                | ${'sig1=("@method" "content-digest" "content-length" "content-type");created=1618884473;keyid="gnap-key"'}
      ${'fails if @content-digest is missing while body is present'}                      | ${'sig1=("@method" "@target-uri" "content-length" "content-type");created=1618884473;keyid="gnap-key"'}
      ${'fails if authorization header is present in headers but not in signature input'} | ${'sig1=("@method" "@target-uri" "content-digest" "content-length" "content-type");created=1618884473;keyid="gnap-key"'}
    `(
      'constructs signature input and $title',
      async ({ sigInputHeader }): Promise<void> => {
        const ctx = createContext(
          {
            headers: {
              'Content-Type': 'application/json',
              'Content-Digest': 'sha-256=:test-hash:',
              'Content-Length': '1234',
              'Signature-Input': sigInputHeader,
              Authorization: 'GNAP test-access-token'
            },
            method: 'GET',
            url: '/test'
          },
          {}
        )

        ctx.request.body = { foo: 'bar' }
        ctx.method = 'GET'
        ctx.request.url = '/test'

        expect(clientService.sigInputToChallenge(sigInputHeader, ctx)).toBe(
          null
        )
      }
    )
  })

  describe('Signature middleware', (): void => {
    let grant: Grant
    let token: AccessToken
    let knex: Knex
    let trx: Knex.Transaction
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
      managementId: v4(),
      expiresIn: 3600
    }

    beforeAll(async (): Promise<void> => {
      knex = await deps.use('knex')
    })

    beforeEach(async (): Promise<void> => {
      grant = await Grant.query(trx).insertAndFetch({
        ...BASE_GRANT,
        clientKeyId: KID_ORIGIN + keyPath
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
    })

    afterEach(async (): Promise<void> => {
      jest.useRealTimers()
      await truncateTables(knex)
    })

    test('Validate POST / request with middleware', async (): Promise<void> => {
      const scope = nock(KID_ORIGIN)
        .get(keyPath)
        .reply(200, {
          keys: [testClientKey.jwk],
          ...TEST_CLIENT_DISPLAY
        })

      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/',
          method: 'POST'
        },
        {},
        {
          client: {
            display: TEST_CLIENT_DISPLAY,
            key: testClientKey
          }
        },
        privateKey
      )

      await clientService.tokenHttpsigMiddleware(ctx, next)

      expect(ctx.response.status).toEqual(200)
      expect(next).toHaveBeenCalled()

      scope.isDone()
    })

    test('Validate /introspect request with middleware', async (): Promise<void> => {
      const scope = nock(KID_ORIGIN)
        .get(keyPath)
        .reply(200, {
          keys: [testClientKey.jwk]
        })

      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/introspect',
          method: 'POST'
        },
        {},
        {
          access_token: token.value,
          proof: 'httpsig',
          resource_server: 'test'
        },
        privateKey
      )

      await clientService.tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(200)

      scope.isDone()
    })

    test('Validate DEL /token request with middleware', async () => {
      const scope = nock(KID_ORIGIN)
        .get(keyPath)
        .reply(200, {
          keys: [testClientKey.jwk]
        })

      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json'
          },
          url: tokenManagementUrl,
          method: 'DELETE'
        },
        { managementId },
        {
          access_token: token.value,
          proof: 'httpsig',
          resource_server: 'test'
        },
        privateKey
      )

      await clientService.tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(200)

      scope.isDone()
    })

    test('httpsig middleware fails if client is invalid', async () => {
      const grant = await Grant.query(trx).insertAndFetch({
        ...BASE_GRANT,
        continueToken: crypto.randomBytes(8).toString('hex'),
        continueId: v4(),
        interactId: v4(),
        interactNonce: crypto.randomBytes(8).toString('hex'),
        interactRef: v4(),
        clientKeyId: 'https://openpayments.network/wrong-key'
      })
      await Access.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_ACCESS
      })
      const token = await AccessToken.query(trx).insertAndFetch({
        grantId: grant.id,
        ...BASE_TOKEN,
        value: crypto.randomBytes(8).toString('hex'),
        managementId: v4()
      })
      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/introspect',
          method: 'POST'
        },
        { managementId },
        {
          access_token: token.value,
          proof: 'httpsig',
          resource_server: 'test',
          test: 'middleware fail'
        },
        privateKey
      )

      await clientService.tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(401)
    })

    test('httpsig middleware fails if headers are invalid', async () => {
      const scope = nock(KID_ORIGIN)
        .get(keyPath)
        .reply(200, {
          keys: [testClientKey.jwk]
        })
      const method = 'DELETE'

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

      ctx.request.body = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }
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
        const scope = nock(KID_ORIGIN)
          .get('/keys/correct')
          .reply(200, {
            ...publicKey,
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
              ...publicKey,
              kid: KID_ORIGIN + '/keys/correct'
            }
          }
        })

        expect(validClient).toEqual(true)
        scope.isDone()
      })

      test('Cannot validate client with incorrect display name', async (): Promise<void> => {
        const scope = nock(KID_ORIGIN)
          .get(TEST_KID_PATH)
          .reply(200, {
            ...publicKey,
            exp: Math.round(expDate.getTime() / 1000),
            nbf: Math.round(nbfDate.getTime() / 1000),
            revoked: false
          })

        const validClient = await clientService.validateClient({
          display: { name: 'Bob', uri: TEST_CLIENT_DISPLAY.uri },
          key: {
            proof: 'httpsig',
            jwk: publicKey
          }
        })

        expect(validClient).toEqual(false)
        scope.isDone()
      })

      test('Cannot validate client with incorrect uri', async (): Promise<void> => {
        const scope = nock(KID_ORIGIN)
          .get(TEST_KID_PATH)
          .reply(200, {
            ...publicKey,
            exp: Math.round(expDate.getTime() / 1000),
            nbf: Math.round(nbfDate.getTime() / 1000),
            revoked: false
          })

        const validClient = await clientService.validateClient({
          display: { name: TEST_CLIENT_DISPLAY.name, uri: 'Bob' },
          key: {
            proof: 'httpsig',
            jwk: publicKey
          }
        })

        expect(validClient).toEqual(false)
        scope.isDone()
      })
    })

    test('Cannot validate client with kid that doesnt resolve', async (): Promise<void> => {
      const scope = nock(KID_ORIGIN).get('/wrong').reply(200)

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
      scope.isDone()
    })

    test('Cannot validate client with jwk that doesnt have a public key', async (): Promise<void> => {
      const scope = nock(KID_ORIGIN)
        .get(TEST_KID_PATH)
        .reply(200, {
          ...publicKey,
          exp: Math.round(expDate.getTime() / 1000),
          nbf: Math.round(nbfDate.getTime() / 1000),
          revoked: false
        })

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
      scope.isDone()
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
      const scope = nock(KID_ORIGIN)
        .get('/keys/notready')
        .reply(200, {
          ...publicKey,
          exp: Math.round(futureDate.getTime() / 1000),
          nbf: Math.round(futureDate.getTime() / 1000),
          revoked: false
        })

      const validKeyKid = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            kid: KID_ORIGIN + '/keys/notready'
          }
        }
      })

      expect(validKeyKid).toEqual(false)
      scope.isDone()
    })

    test('Cannot validate client with expired key', async (): Promise<void> => {
      const scope = nock(KID_ORIGIN)
        .get('/keys/invalidclient')
        .reply(200, {
          ...publicKey,
          exp: Math.round(nbfDate.getTime() / 1000),
          nbf: Math.round(nbfDate.getTime() / 1000),
          revoked: false
        })

      const validClient = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            kid: KID_ORIGIN + '/keys/invalidclient'
          }
        }
      })

      expect(validClient).toEqual(false)
      scope.isDone()
    })

    test('Cannot validate client with revoked key', async (): Promise<void> => {
      const scope = nock(KID_ORIGIN)
        .get('/keys/revoked')
        .reply(200, {
          ...publicKey,
          exp: Math.round(expDate.getTime() / 1000),
          nbf: Math.round(nbfDate.getTime() / 1000),
          revoked: true
        })

      const validClient = await clientService.validateClient({
        display: TEST_CLIENT_DISPLAY,
        key: {
          proof: 'httpsig',
          jwk: {
            ...publicKey,
            kid: KID_ORIGIN + '/keys/revoked'
          }
        }
      })

      expect(validClient).toEqual(false)
      scope.isDone()
    })
  })
})
