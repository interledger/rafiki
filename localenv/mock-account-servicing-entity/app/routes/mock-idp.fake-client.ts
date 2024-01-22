import type { LoaderFunctionArgs } from '@remix-run/node'

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  return new Response(
    JSON.stringify({
      interact_ref: url.searchParams.get('interact_ref'),
      hash: url.searchParams.get('hash')
    })
  )
}
