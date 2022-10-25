import { json } from '@remix-run/node'
import { getAccountBalances } from '~/lib/balances.server'

export async function loader() {
  return json(await getAccountBalances(), { status: 200 })
}
