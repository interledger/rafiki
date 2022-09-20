import type { LoaderArgs } from '@remix-run/node'
import { Response } from '@remix-run/node'

export function loader({ request }: LoaderArgs) {
  const includeHeaders = ['signature', 'signature-input', 'x-idp-secret']
  const responseHeaders: Record<string, string> = {}

  includeHeaders.forEach((h) => {
    const header = request.headers.get(h)
    if (header) {
      responseHeaders[h] = header
    }
  })

  return new Response('interactionUrl', {
    headers: responseHeaders
  })
}
