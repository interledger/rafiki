import type { LoaderFunctionArgs } from '@remix-run/node'
import { parseQueryString } from '~/lib/utils'

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  return new Response(
    JSON.stringify({
      interact_ref: parseQueryString(request.url).getAsString('interact_ref'),
      hash: url.searchParams.get('hash')
    })
  )
}
