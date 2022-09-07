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
import { SignatureService } from './service'
import { ClientKey, JWKWithRequired } from '../client/service'
import { createContext, createContextWithSigHeaders } from '../tests/context'
import {
  TEST_CLIENT_DISPLAY,
  generateTestKeys,
  TEST_CLIENT
} from '../tests/signature'
import { Grant, GrantState, StartMethod, FinishMethod } from '../grant/model'
import { Access } from '../access/model'
import { AccessToken } from '../accessToken/model'
import { AccessType, Action } from '../access/types'
import { KEY_REGISTRY_ORIGIN } from '../grant/routes.test'

describe('Signature Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let signatureService: SignatureService
  let keyPath: string
  let publicKey: JWKWithRequired
  let privateKey: JWKWithRequired
  let testClientKey: {
    proof: string
    jwk: JWKWithRequired
  }

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    signatureService = await deps.use('signatureService')
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
        signatureService.verifySig(
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

      const challenge = signatureService.sigInputToChallenge(
        sigInputHeader,
        ctx
      )
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

        expect(signatureService.sigInputToChallenge(sigInputHeader, ctx)).toBe(
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
      identifier: `https://example.com/${v4()}`,
      limits: {
        receiver: 'https://wallet.com/alice',
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
        clientKeyId: KEY_REGISTRY_ORIGIN + keyPath
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
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(keyPath)
        .reply(200, {
          jwk: testClientKey.jwk,
          client: TEST_CLIENT
        } as ClientKey)

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
            key: {
              proof: 'httpsig',
              jwk: testClientKey.jwk
            }
          }
        },
        privateKey
      )

      await signatureService.tokenHttpsigMiddleware(ctx, next)

      expect(ctx.response.status).toEqual(200)
      expect(next).toHaveBeenCalled()

      scope.isDone()
    })

    test('Validate /introspect request with middleware', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(keyPath)
        .reply(200, {
          jwk: testClientKey.jwk,
          client: TEST_CLIENT
        } as ClientKey)

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

      await signatureService.tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(200)

      scope.isDone()
    })

    test('Validate DEL /token request with middleware', async () => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(keyPath)
        .reply(200, {
          jwk: testClientKey.jwk,
          client: TEST_CLIENT
        } as ClientKey)

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

      await signatureService.tokenHttpsigMiddleware(ctx, next)

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
          resource_server: 'test'
        },
        privateKey
      )

      await signatureService.tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(401)
    })

    test('httpsig middleware fails if headers are invalid', async () => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(keyPath)
        .reply(200, {
          jwk: testClientKey.jwk,
          client: TEST_CLIENT
        } as ClientKey)
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
      await signatureService.tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(400)

      scope.isDone()
    })
  })
})
