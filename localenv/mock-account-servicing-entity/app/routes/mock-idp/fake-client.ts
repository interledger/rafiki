import type { LoaderArgs } from '@remix-run/node'
import { Response } from '@remix-run/node'
import { parseQueryString } from '~/lib/utils'

export function loader({ request }: LoaderArgs) {
  const url = new URL(request.url)
  return new Response(
    JSON.stringify({
      interact_ref: parseQueryString(request.url).getAsString('interact_ref'),
      hash: url.searchParams.get('hash')
    })
  )
}
