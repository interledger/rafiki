import { validateHttpSigHeaders, verifySigAndChallenge } from './verification'
import { createHeaders } from './headers'
import { RequestLike } from 'http-message-signatures'
import { TestKeys, generateTestKeys } from '../test-utils/keys'
import { generateJwk, JWK } from './jwk'
import { createContentDigestHeader } from 'httpbis-digest-headers'

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
  test.each`
    title                                 | withAuthorization | withRequestBody
    ${''}                                 | ${true}           | ${true}
    ${' without an authorization header'} | ${false}          | ${true}
    ${' without a request body'}          | ${true}           | ${false}
  `(
    'can verify signature and challenge$title',
    async ({ withAuthorization, withRequestBody }): Promise<void> => {
      const testRequestBody = JSON.stringify({ foo: 'bar' })

      const headers = {}
      if (withAuthorization) {
        headers['authorization'] = 'GNAP test-access-token'
      }

      const request: RequestLike = {
        headers,
        method: 'GET',
        url: 'http://example.com/test'
      }
      if (withRequestBody) {
        request.body = testRequestBody
      }

      const contentAndSigHeaders = await createHeaders({
        request,
        privateKey: testKeys.privateKey,
        keyId: testKeys.keyId
      })
      const lowerHeaders = Object.fromEntries(
        Object.entries(contentAndSigHeaders).map(([k, v]) => [
          k.toLowerCase(),
          v
        ])
      )
      request.headers = { ...request.headers, ...lowerHeaders }

      await expect(
        verifySigAndChallenge(testClientKey, request)
      ).resolves.toEqual(true)
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
    'validates signature header and $title',
    async ({ sigInputHeader }): Promise<void> => {
      const testRequestBody = JSON.stringify({ foo: 'bar' })
      const request = {
        headers: {
          'content-type': 'application/json',
          'content-digest': createContentDigestHeader(testRequestBody, [
            'sha-512'
          ]),
          'content-length': '1234',
          'signature-input': sigInputHeader,
          authorization: 'GNAP test-access-token'
        },
        method: 'GET',
        url: 'http://example.com/test',
        body: testRequestBody
      }
      expect(validateHttpSigHeaders(request)).toBe(false)
    }
  )
})
