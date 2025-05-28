import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { Badge, PageHeader } from '~/components'
import { Button, Table } from '~/components/ui'
import { listWalletAddresses } from '~/lib/api/wallet-address.server'
import { paginationSchema } from '~/lib/validate.server'
import { badgeColorByWalletAddressStatus } from '~/shared/utils'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const url = new URL(request.url)
  const pagination = paginationSchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  )

  if (!pagination.success) {
    throw json(null, { status: 400, statusText: 'Invalid pagination.' })
  }

  const walletAddresses = await listWalletAddresses(request, {
    ...pagination.data
  })

  let previousPageUrl = '',
    nextPageUrl = ''

  if (walletAddresses.pageInfo.hasPreviousPage) {
    previousPageUrl = `/wallet-addresses?before=${walletAddresses.pageInfo.startCursor}`
  }

  if (walletAddresses.pageInfo.hasNextPage) {
    nextPageUrl = `/wallet-addresses?after=${walletAddresses.pageInfo.endCursor}`
  }

  return json({ walletAddresses, previousPageUrl, nextPageUrl })
}

export default function WalletAddressesPage() {
  const { walletAddresses, previousPageUrl, nextPageUrl } =
    useLoaderData<typeof loader>()
  const navigate = useNavigate()

  return (
    <div className='pt-4 flex flex-col space-y-8'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <div className='flex-1'>
            <h3 className='text-2xl'>Wallet Addresses</h3>
          </div>
          <div className='ml-auto'>
            <Button
              to='/wallet-addresses/create'
              aria-label='create a new wallet address'
            >
              Create wallet address
            </Button>
          </div>
        </PageHeader>
        <Table>
          <Table.Head columns={['Wallet address', 'Public name', 'Status']} />
          <Table.Body>
            {walletAddresses.edges.length ? (
              walletAddresses.edges.map((pp) => (
                <Table.Row
                  key={pp.node.id}
                  className='cursor-pointer'
                  onClick={() => navigate(`/wallet-addresses/${pp.node.id}`)}
                >
                  <Table.Cell>{pp.node.address}</Table.Cell>
                  <Table.Cell>
                    <div className='flex flex-col'>
                      {pp.node.publicName ? (
                        <span className='font-medium'>
                          {pp.node.publicName}
                        </span>
                      ) : (
                        <span className='text-tealish/80'>No public name</span>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      color={badgeColorByWalletAddressStatus[pp.node.status]}
                    >
                      {pp.node.status}
                    </Badge>
                  </Table.Cell>
                </Table.Row>
              ))
            ) : (
              <Table.Row>
                <Table.Cell colSpan={4} className='text-center'>
                  No wallet addresses found.
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
        <div className='flex items-center justify-between p-5'>
          <Button
            aria-label='go to previous page'
            disabled={!walletAddresses.pageInfo.hasPreviousPage}
            onClick={() => {
              navigate(previousPageUrl)
            }}
          >
            Previous
          </Button>
          <Button
            aria-label='go to next page'
            disabled={!walletAddresses.pageInfo.hasNextPage}
            onClick={() => {
              navigate(nextPageUrl)
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
