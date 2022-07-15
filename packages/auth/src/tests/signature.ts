import crypto from 'crypto'
import { importJWK } from 'jose'
import { KEY_REGISTRY_ORIGIN, TEST_KID_PATH } from '../grant/routes.test'

export const SIGNATURE_METHOD = 'GET'
export const SIGNATURE_TARGET_URI = '/test'

export const TEST_CLIENT_KEY = {
  proof: 'httpsig',
  jwk: {
    kid: KEY_REGISTRY_ORIGIN + TEST_KID_PATH,
    x: 'hin88zzQxp79OOqIFNCME26wMiz0yqjzgkcBe0MW8pE',
    kty: 'OKP',
    alg: 'EdDSA',
    crv: 'Ed25519',
    key_ops: ['sign', 'verify'],
    use: 'sig'
  }
}

export async function generateSigHeaders(
  url: string,
  method: string,
  body?: unknown
): Promise<{ sigInput: string; signature: string; contentDigest?: string }> {
  const privateKey = {
    ...TEST_CLIENT_KEY.jwk,
    d: 'v6gr9N9Nf3AUyuTgU5pk7gyNULQnzNJCBNMPp5OkiqA'
  }

  const sigInput = body
    ? 'sig1=("@method" "@target-uri" "content-digest");created=1618884473;keyid="gnap-key"'
    : 'sig1=("@method" "@target-uri");created=1618884473;keyid="gnap-key"'
  let challenge
  let contentDigest
  if (body) {
    const hash = crypto.createHash('sha256')
    hash.update(Buffer.from(JSON.stringify(body)))
    const bodyDigest = hash.digest()
    contentDigest = `sha-256:${bodyDigest.toString('base64')}:`
    challenge = `"@method": ${method}\n"@target-uri": ${url}\n"content-digest": ${contentDigest}\n"@signature-params": ${sigInput.replace(
      'sig1=',
      ''
    )}`
  } else {
    challenge = `"@method": ${method}\n"@target-uri": ${url}\n"@signature-params": ${sigInput.replace(
      'sig1=',
      ''
    )}`
  }

  const privateJwk = (await importJWK(privateKey)) as crypto.KeyLike
  const signature = crypto.sign(null, Buffer.from(challenge), privateJwk)

  return { signature: signature.toString('base64'), sigInput, contentDigest }
}
