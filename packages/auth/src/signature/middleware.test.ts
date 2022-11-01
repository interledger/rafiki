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
import {
  verifySig,
  sigInputToChallenge,
  tokenHttpsigMiddleware,
  grantContinueHttpsigMiddleware,
  grantInitiationHttpsigMiddleware
} from './middleware'

describe('Signature Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let keyPath: string
  let publicKey: JWKWithRequired
  let privateKey: JWKWithRequired
  let testClientKey: {
    proof: string
    jwk: JWKWithRequired
  }

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
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
        verifySig(signature.toString('base64'), publicKey, challenge)
      ).resolves.toBe(true)
    })

    // test('can construct a challenge from signature input', (): void => {
    //   const sigInputHeader =
    //     'sig1=("@method" "@target-uri" "content-digest" "content-length" "content-type" "authorization");created=1618884473;keyid="gnap-key"'
    //   const ctx = createContext(
    //     {
    //       headers: {
    //         'Content-Type': 'application/json',
    //         'Content-Digest': 'sha-256=:test-hash:',
    //         'Content-Length': '1234',
    //         'Signature-Input': sigInputHeader,
    //         Authorization: 'GNAP test-access-token'
    //       },
    //       method: 'GET',
    //       url: '/test'
    //     },
    //     {},
    //     deps
    //   )

    //   ctx.request.body = { foo: 'bar' }

    //   const challenge = sigInputToChallenge(sigInputHeader, ctx)
    //   expect(challenge).toEqual(
    //     `"@method": GET\n"@target-uri": /test\n"content-digest": sha-256=:test-hash:\n"content-length": 1234\n"content-type": application/json\n"authorization": GNAP test-access-token\n"@signature-params": ${sigInputHeader.replace(
    //       'sig1=',
    //       ''
    //     )}`
    //   )
    // })

    test.each`
      title                                 | withAuthorization | withRequestBody
      ${''}                                 | ${true}           | ${true}
      ${' without an authorization header'} | ${false}          | ${true}
      ${' without a request body'}          | ${true}           | ${false}
    `(
      'can construct a challenge from signature input$title',
      ({ withAuthorization, withRequestBody }): void => {
        let sigInputHeader = 'sig1=("@method" "@target-uri" "content-type"'

        const headers = {
          'Content-Type': 'application/json'
        }
        let expectedChallenge = `"@method": GET\n"@target-uri": /test\n"content-type": application/json\n`

        if (withRequestBody) {
          sigInputHeader += ' "content-digest" "content-length"'
          headers['Content-Digest'] = 'sha-256=:test-hash:'
          headers['Content-Length'] = '1234'
          expectedChallenge +=
            '"content-digest": sha-256=:test-hash:\n"content-length": 1234\n'
        }

        if (withAuthorization) {
          sigInputHeader += ' "authorization"'
          headers['Authorization'] = 'GNAP test-access-token'
          expectedChallenge += '"authorization": GNAP test-access-token\n'
        }

        sigInputHeader += ');created=1618884473;keyid="gnap-key"'
        headers['Signature-Input'] = sigInputHeader
        expectedChallenge += `"@signature-params": ${sigInputHeader.replace(
          'sig1=',
          ''
        )}`

        const ctx = createContext(
          {
            headers,
            method: 'GET',
            url: '/test'
          },
          {},
          deps
        )

        ctx.request.body = withRequestBody ? { foo: 'bar' } : {}

        const challenge = sigInputToChallenge(sigInputHeader, ctx)

        expect(challenge).toEqual(expectedChallenge)
      }
    )

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
          {},
          deps
        )

        ctx.request.body = { foo: 'bar' }
        ctx.method = 'GET'
        ctx.request.url = '/test'

        expect(sigInputToChallenge(sigInputHeader, ctx)).toBe(null)
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

    test('Validate grant initiation request with middleware', async (): Promise<void> => {
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
        privateKey,
        deps
      )

      await grantInitiationHttpsigMiddleware(ctx, next)

      expect(ctx.response.status).toEqual(200)
      expect(next).toHaveBeenCalled()

      scope.isDone()
    })

    test('Validate grant continuation request with middleware', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(keyPath)
        .reply(200, {
          jwk: testClientKey.jwk,
          client: TEST_CLIENT
        } as ClientKey)

      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json',
            Authorization: `GNAP ${grant.continueToken}`
          },
          url: '/continue',
          method: 'POST'
        },
        { id: grant.continueId },
        { interact_ref: grant.interactRef },
        privateKey,
        deps
      )

      await grantContinueHttpsigMiddleware(ctx, next)
      expect(ctx.response.status).toEqual(200)
      expect(next).toHaveBeenCalled()

      scope.isDone()
    })

    test('Validate token management request with middleware', async () => {
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
        { id: managementId },
        {
          access_token: token.value,
          proof: 'httpsig',
          resource_server: 'test'
        },
        privateKey,
        deps
      )

      await tokenHttpsigMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.response.status).toEqual(200)

      scope.isDone()
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
        { id: managementId },
        deps
      )

      ctx.request.body = {
        access_token: token.value,
        proof: 'httpsig',
        resource_server: 'test'
      }
      await tokenHttpsigMiddleware(ctx, next)
      expect(ctx.response.status).toEqual(400)
      expect(ctx.response.body.error).toEqual('invalid_request')
      expect(ctx.response.body.message).toEqual('invalid signature headers')

      scope.isDone()
    })

    test('middleware fails if signature is invalid', async (): Promise<void> => {
      const scope = nock(KEY_REGISTRY_ORIGIN)
        .get(keyPath)
        .reply(200, {
          jwk: testClientKey.jwk,
          client: TEST_CLIENT
        } as ClientKey)

      const ctx = await createContextWithSigHeaders(
        {
          headers: {
            Accept: 'application/json',
            Authorization: `GNAP ${grant.continueToken}`
          },
          url: '/continue',
          method: 'POST'
        },
        { id: grant.continueId },
        { interact_ref: grant.interactRef },
        privateKey,
        deps
      )

      ctx.headers['signature'] = 'wrong-signature'

      await expect(
        grantContinueHttpsigMiddleware(ctx, next)
      ).rejects.toHaveProperty('status', 401)

      scope.isDone()
    })

    test('middleware fails if client is invalid', async (): Promise<void> => {
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
              jwk: {
                ...testClientKey.jwk,
                kid: KEY_REGISTRY_ORIGIN + '/wrong-kid'
              }
            }
          }
        },
        privateKey,
        deps
      )

      await grantInitiationHttpsigMiddleware(ctx, next)
      expect(ctx.response.status).toEqual(401)
      expect(ctx.body).toMatchObject({ error: 'invalid_client' })
    })
  })
})
