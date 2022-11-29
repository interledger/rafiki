import { createPublicKey, generateKeyPairSync, type JsonWebKey } from 'crypto'

type OpenPaymentsJWK = JsonWebKey & {
  alg: 'EdDSA'
  kid: string
}

export const generateJwk = ({ keyId }: { keyId: string }): OpenPaymentsJWK => {
  const jwk = createPublicKey(generateKeyPairSync('ed25519').privateKey).export(
    {
      format: 'jwk'
    }
  )

  return {
    alg: 'EdDSA',
    kid: keyId,
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x
  }
}
