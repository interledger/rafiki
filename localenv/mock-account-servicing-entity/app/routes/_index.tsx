import { json, LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { PageHeader, Button, Table } from '../components'
import { getAccountsWithBalance } from '../lib/balances.server'
import { getTenantCredentials } from '~/lib/utils'
import { messageStorage } from '~/lib/message.server'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = await messageStorage.getSession(request.headers.get('cookie'))
  await getTenantCredentials(session)
  const accountsWithBalance = await getAccountsWithBalance()

  return json({ accountsWithBalance })
}

export default function Accounts() {
  const { accountsWithBalance } = useLoaderData<typeof loader>()
  const navigate = useNavigate()

  return (
    <div className='pt-4 flex flex-col space-y-8'>
      <div className='flex flex-col rounded-md bg-white px-6'>
        <PageHeader>
          <div className='flex-1'>
            <h3 className='text-2xl'>Accounts</h3>
          </div>
          <div className='ml-auto'>
            <Button aria-label='add new account' to='/accounts/create'>
              Add account
            </Button>
          </div>
        </PageHeader>
        <Table>
          <Table.Head
            columns={['ID', 'Account', 'Wallet Address', 'Balance']}
          />
          <Table.Body>
            {accountsWithBalance.length ? (
              accountsWithBalance.map((account) => (
                <Table.Row
                  key={account.id}
                  className='cursor-pointer'
                  onClick={() => navigate(`/accounts/${account.id}`)}
                >
                  <Table.Cell>{account.id}</Table.Cell>
                  <Table.Cell>{account.name}</Table.Cell>
                  <Table.Cell>{account.walletAddress}</Table.Cell>
                  <Table.Cell>
                    {(Number(account.balance) / 100).toFixed(
                      account.assetScale
                    )}{' '}
                    {account.assetCode}
                  </Table.Cell>
                </Table.Row>
              ))
            ) : (
              <Table.Row>
                <Table.Cell colSpan={4} className='text-center'>
                  No accounts found.
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
        <div className='flex items-center justify-between p-5'>&nbsp;</div>
      </div>
    </div>
  )
}
