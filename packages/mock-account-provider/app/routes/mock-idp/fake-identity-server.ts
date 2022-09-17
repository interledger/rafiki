import { LoaderArgs, Response } from '@remix-run/node'

export function loader({ request }: LoaderArgs) {
  const includeHeaders = ['signature', 'signature-input', 'x-idp-secret']
  let responseHeaders: Record<string, string> = {}

  includeHeaders.forEach((h) => {
    if (request.headers.has(h)) {
      responseHeaders[h] = request.headers.get(h)!
    }
  })

  return new Response('interactionUrl', {
    headers: responseHeaders
  })
}
