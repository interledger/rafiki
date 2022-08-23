import type { ActionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'

export function action({ request }: ActionArgs) {
  console.log('received webhook: ', JSON.stringify(request.body))
  return json(request.body, { status: 201 })
}
