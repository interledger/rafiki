import { json, type LoaderArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { PageHeader } from '~/components'
import { Button, Table } from '~/components/ui'
import { listAssets } from '~/lib/api/asset.server'
import { paginationSchema } from '~/lib/validate.server'

export const loader = async ({ request }: LoaderArgs) => {
  const url = new URL(request.url)
  const pagination = paginationSchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  )

  if (!pagination.success) {
    throw json(null, { status: 400, statusText: 'Invalid pagination.' })
  }

  const assets = await listAssets({
    ...pagination.data
  })

  let previousPageUrl = '',
    nextPageUrl = ''

  if (assets.pageInfo.hasPreviousPage) {
    previousPageUrl = `/assets?before=${assets.pageInfo.startCursor}`
  }

  if (assets.pageInfo.hasNextPage) {
    nextPageUrl = `/assets?after=${assets.pageInfo.endCursor}`
  }

  return json({ assets, previousPageUrl, nextPageUrl })
}

export default function AssetsPage() {
  const { assets, previousPageUrl, nextPageUrl } =
    useLoaderData<typeof loader>()
  const navigate = useNavigate()

  return (
    <div className='pt-4 flex flex-col space-y-8'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <div className='flex-1'>
            <h3 className='text-2xl'>Assets</h3>
          </div>
          <div className='ml-auto'>
            <Button aria-label='add new asset' to='/assets/create'>
              Add asset
            </Button>
          </div>
        </PageHeader>
        <Table>
          <Table.Head
            columns={['ID', 'Code', 'Scale', 'Withdrawal threshold']}
          />
          <Table.Body>
            {assets.edges.length ? (
              assets.edges.map((asset) => (
                <Table.Row
                  key={asset.node.id}
                  className='cursor-pointer'
                  onClick={() => navigate(`/assets/${asset.node.id}`)}
                >
                  <Table.Cell>{asset.node.id}</Table.Cell>
                  <Table.Cell>{asset.node.code}</Table.Cell>
                  <Table.Cell>{asset.node.scale}</Table.Cell>
                  <Table.Cell>
                    {asset.node.withdrawalThreshold ? (
                      asset.node.withdrawalThreshold
                    ) : (
                      <span className='italic font-light'>
                        No withdrawal threshold
                      </span>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))
            ) : (
              <Table.Row>
                <Table.Cell colSpan={4} className='text-center'>
                  No assets found.
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
        <div className='flex items-center justify-between p-5'>
          <Button
            aria-label='go to previous page'
            disabled={!assets.pageInfo.hasPreviousPage}
            onClick={() => {
              navigate(previousPageUrl)
            }}
          >
            Previous
          </Button>
          <Button
            aria-label='go to next page'
            disabled={!assets.pageInfo.hasNextPage}
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
