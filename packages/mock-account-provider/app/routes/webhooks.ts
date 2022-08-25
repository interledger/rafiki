import type { ActionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'

export async function action({ request }: ActionArgs) {
  const payload = await request.json()
  console.log('received webhook: ', JSON.stringify(payload))
  return json(undefined, { status: 200 })
}
