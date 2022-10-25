import { json } from '@remix-run/node'
import { mockAccounts } from '~/lib/accounts.server'

export async function loader() {
  const accounts = await mockAccounts.listAll()
  return json(
    accounts.map((acc) => {
      return {
        paymentPointer: acc.paymentPointer,
        balance: (
          BigInt(acc.creditsPosted) - BigInt(acc.debitsPosted)
        ).toString()
      }
    }),
    { status: 200 }
  )
}
