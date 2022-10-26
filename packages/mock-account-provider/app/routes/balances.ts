import { json } from '@remix-run/node'
import { getAccountsWithBalance } from '../lib/balances.server'

export async function loader() {
  return json(await getAccountsWithBalance(), { status: 200 })
}
