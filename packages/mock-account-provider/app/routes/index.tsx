import type { ActionFunction } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, useFetcher, useLoaderData } from '@remix-run/react'
import { updatePaymentPointerCredential } from '~/lib/credentials.server'
import { getAccountsWithBalance } from '../lib/balances.server'
import tableStyle from '../styles/table.css'

type LoaderData = {
  accountsWithBalance: Awaited<ReturnType<typeof getAccountsWithBalance>>
}

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData()
  const values = Object.fromEntries(formData)

  await updatePaymentPointerCredential(
    values['paymentPointerId'].toString(),
    values['credentialId'].toString()
  )
  return json({ success: true })
}

export const loader = async () => {
  return json<LoaderData>({
    accountsWithBalance: await getAccountsWithBalance()
  })
}

export default function Accounts() {
  const fetcher = useFetcher()
  const { accountsWithBalance } = useLoaderData() as LoaderData

  const registerCredential = async (
    paymentPointer: string,
    paymentPointerId: string
  ) => {
    const publicKey = {
      challenge: new Uint8Array(1),
      rp: {
        name: 'Fynbos Wallet'
      },
      user: {
        id: new Uint8Array(1),
        name: paymentPointer,
        displayName: paymentPointer
      },
      pubKeyCredParams: [
        {
          type: 'public-key',
          alg: -7
        },
        {
          type: 'public-key',
          alg: -257
        }
      ],
      authenticatorSelection: {
        userVerification: 'required',
        requireResidentKey: true,
        authenticatorAttachment: 'platform'
      },
      timeout: 60000,
      extensions: {
        payment: {
          isPayment: true
        }
      }
    } as PublicKeyCredentialCreationOptions

    const credential = await navigator.credentials
      .create({ publicKey })
      .catch((error) => {
        throw error
      })

    if (!credential) {
      throw new Error('No credential')
    }

    fetcher.submit(
      {
        paymentPointerId: paymentPointerId,
        credentialId: credential.id
      },
      { method: 'put' }
    )

    return
  }

  return (
    <main>
      <h1>Accounts</h1>
      <table>
        <tr>
          <th>#</th>
          <th>Account Name</th>
          <th>Payment Pointer</th>
          <th>Balance</th>
          <th>Credential</th>
        </tr>
        {accountsWithBalance.map((acc, i) => (
          <tr key={acc.id}>
            <td>{i + 1}</td>
            <td>
              <Link to={`/accounts/${acc.id}`}>{acc.name}</Link>
            </td>
            <td>{acc.paymentPointer}</td>
            <td>
              {(Number(acc.balance) / 100).toFixed(acc.assetScale)}{' '}
              {acc.assetCode}
            </td>
            <td>
              <button
                onClick={() =>
                  registerCredential(acc.paymentPointer, acc.paymentPointerID)
                }
              >
                Update Credential
              </button>
            </td>
          </tr>
        ))}
      </table>
    </main>
  )
}

export function links() {
  return [{ rel: 'stylesheet', href: tableStyle }]
}
