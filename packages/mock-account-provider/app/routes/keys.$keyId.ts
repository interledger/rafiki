import type { LoaderArgs } from '@remix-run/node'
import { json } from '@remix-run/node'

export function loader({ request }: LoaderArgs) {
  // TODO Fetch actual key relating to keyId
  return json(
    {
      kid: request.url,
      x: 'test-public-key',
      kty: 'OKP',
      alg: 'EdDSA',
      crv: 'Ed25519',
      key_ops: ['sign', 'verify'],
      use: 'sig'
    },
    { status: 200 }
  )
}
