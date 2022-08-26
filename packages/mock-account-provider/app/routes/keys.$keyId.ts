import type { LoaderArgs } from '@remix-run/node'
import { json } from '@remix-run/node'

export function loader({ request }: LoaderArgs) {
  // TODO Fetch actual key relating to keyId
  return json(
    {
      jwk: {
        kid: request.url,
        x: 'test-public-key',
        kty: 'OKP',
        alg: 'EdDSA',
        crv: 'Ed25519',
        key_ops: ['sign', 'verify'],
        use: 'sig'
      },
      client: {
        id: '73bc0345-f03f-4627-903c-5abb55656d15'
      }
    },
    { status: 200 }
  )
}
