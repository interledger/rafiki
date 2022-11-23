import { parse } from 'querystring'
import { createPublicKey, generateKeyPairSync, type JsonWebKey } from 'crypto'

export function parseQueryString(query: string) {
  const dictionary = parse(query)
  const pairs = Object.keys(dictionary).map((k) => {
    return [k.toLowerCase().replace(/^\?/, ''), dictionary[k] ?? '']
  })

  return {
    get: (key: string): string | Array<string> | undefined => {
      return (pairs.find((p) => p[0] === key.toLowerCase()) || ['', ''])[1]
    },
    getAsArray: (key: string): Array<string> | undefined => {
      const value = (pairs.find((p) => p[0] === key.toLowerCase()) || [
        '',
        ''
      ])[1]
      if (Array.isArray(value)) {
        return value
      } else {
        return [value]
      }
    },
    getAsString: (key: string): string | undefined => {
      const value = (pairs.find((p) => p[0] === key.toLowerCase()) || [
        '',
        ''
      ])[1]
      if (Array.isArray(value)) {
        return value[value.length - 1]
      } else {
        return value
      }
    },
    has: (...keys: Array<string>) => {
      return keys.every((k) => pairs.some((p) => p[0] === k.toLowerCase()))
    }
  }
}

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
