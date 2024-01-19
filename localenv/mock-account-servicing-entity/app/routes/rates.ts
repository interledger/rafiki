import type { LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { CONFIG as config } from '~/lib/parse_config.server'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function loader({ request }: LoaderFunctionArgs) {
  const base = new URL(request.url).searchParams.get('base') || 'USD'

  return json(
    {
      base,
      rates: config.seed.rates[base] || {}
    },
    { status: 200 }
  )
}
