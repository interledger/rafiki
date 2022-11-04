import { LoaderArgs, Response } from '@remix-run/node'
import { parseQueryString } from '~/lib/utils'

export function loader({ request }: LoaderArgs) {
  return new Response(JSON.stringify({
    interact_ref: parseQueryString(request.url).getAsString('interact_ref')
  }))
}
