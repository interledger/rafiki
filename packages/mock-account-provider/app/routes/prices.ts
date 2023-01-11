import type { LoaderArgs } from '@remix-run/node'
import { json } from '@remix-run/node'

export function loader({ request }: LoaderArgs) {
  return json(
    {
      'USD:USD': '1.0',
      'USD:EUR': '1.1602',
      'USD:ZAR': '17.3792'
    },
    { status: 200 }
  )
}
