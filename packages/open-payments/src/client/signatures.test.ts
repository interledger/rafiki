/* eslint-disable @typescript-eslint/no-empty-function */
import { createSignatureHeaders, verifySignatureHeaders } from './signatures'
import { generateKeyPairSync } from 'crypto'
import { JWK } from 'jose'

describe('signatures', (): void => {
  const request = {
    headers: {
      authorization: 'GNAP access-token'
    },
    url: 'https://example.com',
    method: 'GET'
  }
  const keyId = 'myId'
  let jwk: JWK

  beforeAll(async (): Promise<void> => {
    const privateKey = generateKeyPairSync('ed25519').privateKey
    jwk = {
      ...privateKey.export({ format: 'jwk' }),
      kid: keyId,
      alg: 'ed25519'
    }
    const sigHeaders = await createSignatureHeaders({
      keyId,
      privateKey,
      request
    })
    request.headers['Signature'] = sigHeaders['Signature']
    request.headers['Signature-Input'] = sigHeaders['Signature-Input']
  })

  describe('verifySignatureHeaders', (): void => {
    test('verifies signature headers', async (): Promise<void> => {
      expect(
        verifySignatureHeaders({
          request,
          jwks: [jwk]
        })
      ).resolves.toBe(true)
    })

    test('does not verify invalid signature header', async (): Promise<void> => {
      const privateKey = generateKeyPairSync('ed25519').privateKey
      const wrongJwk = {
        ...privateKey.export({ format: 'jwk' }),
        kid: keyId,
        alg: 'ed25519'
      }

      expect(
        verifySignatureHeaders({
          request,
          jwks: [wrongJwk]
        })
      ).resolves.toBe(false)
    })

    test('does not verify unknown signature key id', async (): Promise<void> => {
      expect(
        verifySignatureHeaders({
          request,
          jwks: [
            {
              ...jwk,
              kid: 'other-id'
            }
          ]
        })
      ).resolves.toBe(false)
    })

    test('does not verify invalid key alg', async (): Promise<void> => {
      expect(
        verifySignatureHeaders({
          request,
          jwks: [
            {
              ...jwk,
              alg: 'hmac-sha256'
            }
          ]
        })
      ).resolves.toBe(false)
    })
  })
})
