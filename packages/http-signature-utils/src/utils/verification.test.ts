import * as crypto from 'crypto'
import { createContentDigestHeader } from 'httpbis-digest-headers'

import { verifySig, sigInputToChallenge } from './verification'
import { TestKeys, generateTestKeys } from '../test-utils/keys'
import { generateJwk, JWK } from './jwk'
import { RequestLike } from 'http-message-signatures'

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

  test.each`
    title                                 | withAuthorization | withRequestBody
    ${''}                                 | ${true}           | ${true}
    ${' without an authorization header'} | ${false}          | ${true}
    ${' without a request body'}          | ${true}           | ${false}
  `(
    'can construct a challenge from signature input$title',
    ({ withAuthorization, withRequestBody }): void => {
      const testRequestBody = JSON.stringify({ foo: 'bar' })

      let sigInputHeader = 'sig1=("@method" "@target-uri"'
      let expectedChallenge = `"@method": GET\n"@target-uri": http://example.com/test\n`

      const headers = {}

      if (withAuthorization) {
        sigInputHeader += ' "authorization"'
        headers['authorization'] = 'GNAP test-access-token'
        expectedChallenge += '"authorization": GNAP test-access-token\n'
      }

      if (withRequestBody) {
        const contentDigest = createContentDigestHeader(testRequestBody, [
          'sha-512'
        ])
        headers['content-digest'] = contentDigest
        headers['content-length'] = '123'
        headers['content-type'] = 'application/json'
        sigInputHeader += ' "content-digest" "content-length" "content-type"'
        expectedChallenge += `"content-digest": ${contentDigest}\n"content-length": 123\n"content-type": application/json\n`
      }

      sigInputHeader += ');created=1618884473;keyid="gnap-key"'
      headers['signature-input'] = sigInputHeader
      expectedChallenge += `"@signature-params": ${sigInputHeader.replace(
        'sig1=',
        ''
      )}`

      const request: RequestLike = {
        headers,
        method: 'GET',
        url: 'http://example.com/test'
      }
      if (withRequestBody) {
        request.body = testRequestBody
      }

      const challenge = sigInputToChallenge(sigInputHeader, request)
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
      expect(sigInputToChallenge(sigInputHeader, request)).toBe(null)
    }
  )
})
