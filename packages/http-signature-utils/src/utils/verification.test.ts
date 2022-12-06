import * as crypto from 'crypto'
import * as httpMocks from 'node-mocks-http'
import EventEmitter from 'events'
import Koa from 'koa'
import { Context } from 'koa'
import { createContentDigestHeader } from 'httpbis-digest-headers'

import { verifySig, sigInputToChallenge } from './verification'
import { TestKeys, generateTestKeys } from '../test-utils/keys'
import { generateJwk, JWK } from './jwk'

function createContext(
  reqOpts: httpMocks.RequestOptions,
  params: Record<string, unknown>
): Context {
  const req = httpMocks.createRequest(reqOpts)
  const res = httpMocks.createResponse()
  const koa = new Koa()
  koa.keys = ['test-key']
  const ctx = koa.createContext(req, res)
  ctx.params = params
  ctx.session = { ...req.session }
  ctx.closeEmitter = new EventEmitter()
  return ctx
}

describe('Signature Verification', (): void => {
  let testKeys: TestKeys
  let testClientKey: JWK

  beforeEach(async (): Promise<void> => {
    testKeys = await generateTestKeys()
    testClientKey = generateJwk({
      privateKey: testKeys.privateKey,
      keyId: testKeys.keyId
    })
  })

  test('can verify a signature', async (): Promise<void> => {
    const challenge = 'test-challenge'
    const signature = crypto.sign(
      null,
      Buffer.from(challenge),
      testKeys.privateKey
    )
    await expect(
      verifySig(signature.toString('base64'), testClientKey, challenge)
    ).resolves.toBe(true)
  })

  const testRequestBody = { foo: 'bar' }

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
      let expectedChallenge = `"@method": GET\n"@target-uri": http://example.com/test\n"content-type": application/json\n`
      const contentDigest = createContentDigestHeader(
        JSON.stringify(testRequestBody),
        ['sha-512']
      )

      if (withRequestBody) {
        sigInputHeader += ' "content-digest" "content-length"'
        headers['Content-Digest'] = contentDigest
        headers['Content-Length'] = '1234'
        expectedChallenge += `"content-digest": ${contentDigest}\n"content-length": 1234\n`
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
          url: 'example.com/test'
        },
        {}
      )

      ctx.request['body'] = withRequestBody ? testRequestBody : {}

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
            'Content-Digest': createContentDigestHeader(
              JSON.stringify(testRequestBody),
              ['sha-512']
            ),
            'Content-Length': '1234',
            'Signature-Input': sigInputHeader,
            Authorization: 'GNAP test-access-token'
          },
          method: 'GET',
          url: '/test'
        },
        {}
      )

      ctx.request['body'] = testRequestBody
      ctx.method = 'GET'
      ctx.request.url = '/test'

      expect(sigInputToChallenge(sigInputHeader, ctx)).toBe(null)
    }
  )
})
