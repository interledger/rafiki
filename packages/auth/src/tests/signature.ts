import crypto from 'crypto'
import { v4 } from 'uuid'
import { createContentDigestHeader } from 'httpbis-digest-headers'
import { importJWK, exportJWK } from 'jose'
import { JWKWithRequired } from '../client/service'

export const SIGNATURE_METHOD = 'GET'
export const SIGNATURE_TARGET_URI = '/test'
export const KEY_REGISTRY_ORIGIN = 'https://openpayments.network'

export const TEST_CLIENT = {
  id: v4(),
  name: 'Test Client',
  email: 'bob@bob.com',
  image: 'a link to an image',
  uri: 'https://example.com'
}

export const TEST_CLIENT_DISPLAY = {
  name: TEST_CLIENT.name,
  uri: TEST_CLIENT.uri
}

// TODO: refactor any oustanding key-using tests to generate them from here
const BASE_TEST_KEY_JWK = {
  kty: 'OKP',
  alg: 'EdDSA',
  crv: 'Ed25519',
  use: 'sig'
}

export async function generateTestKeys(): Promise<{
  keyId: string
  publicKey: JWKWithRequired
  privateKey: JWKWithRequired
}> {
  const { privateKey } = crypto.generateKeyPairSync('ed25519')

  const { x, d } = await exportJWK(privateKey)
  const keyId = v4()
  return {
    keyId,
    publicKey: {
      ...BASE_TEST_KEY_JWK,
      kid: keyId,
      x
    },
    privateKey: {
      ...BASE_TEST_KEY_JWK,
      kid: keyId,
      x,
      d
    }
  }
}

export async function generateSigHeaders({
  privateKey,
  url,
  method,
  keyId,
  optionalComponents
}: {
  privateKey: JWKWithRequired
  url: string
  method: string
  keyId: string
  optionalComponents?: {
    body?: unknown
    authorization?: string
  }
}): Promise<{
  sigInput: string
  signature: string
  contentDigest?: string
  contentLength?: string
  contentType?: string
}> {
  let sigInputComponents = 'sig1=("@method" "@target-uri"'
  const { body, authorization } = optionalComponents ?? {}
  if (body)
    sigInputComponents += ' "content-digest" "content-length" "content-type"'

  if (authorization) sigInputComponents += ' "authorization"'

  const sigInput = sigInputComponents + `);created=1618884473;keyid="${keyId}"`
  let challenge = `"@method": ${method}\n"@target-uri": ${url}\n`
  let contentDigest
  let contentLength
  let contentType
  if (body) {
    contentDigest = createContentDigestHeader(JSON.stringify(body), ['sha-512'])
    challenge += `"content-digest": ${contentDigest}\n`

    contentLength = Buffer.from(JSON.stringify(body), 'utf-8').length
    challenge += `"content-length": ${contentLength}\n`
    contentType = 'application/json'
    challenge += `"content-type": ${contentType}\n`
  }

  if (authorization) {
    challenge += `"authorization": ${authorization}\n`
  }

  challenge += `"@signature-params": ${sigInput.replace('sig1=', '')}`

  const privateJwk = (await importJWK(privateKey)) as crypto.KeyLike
  const signature = crypto.sign(null, Buffer.from(challenge), privateJwk)

  return {
    signature: signature.toString('base64'),
    sigInput,
    contentDigest,
    contentLength,
    contentType
  }
}
