import type { LoaderArgs } from '@remix-run/node'
import { json } from '@remix-run/node'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function loader({ request }: LoaderArgs) {
  return json(
    {
      base: 'USD',
      rates: {
        EUR: 1.1602,
        ZAR: 17.3792
      }
    },
    { status: 200 }
  )
}
