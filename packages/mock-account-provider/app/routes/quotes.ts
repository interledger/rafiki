import type { ActionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'

export async function action({ request }: ActionArgs) {
  const receivedQuote = await request.json()
  console.log('received quote: ', JSON.stringify(receivedQuote))
  return json(receivedQuote, { status: 201 })
}
