import { json, type LoaderArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import PageHeader from '~/components/PageHeader'
import { Button } from '~/components/ui/Button'
import { Table, TBody, TCell, THead, TRow } from '~/components/ui/Table'
import { listAssets } from '~/lib/api/asset.server'
import { paginationSchema } from '~/lib/validate.server'

export const loader = async ({ request }: LoaderArgs) => {
  const url = new URL(request.url)
  const pagination = paginationSchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  )

  if (!pagination.success) {
    throw new Error('Invalid pagination.')
  }

  const assets = await listAssets({
    ...pagination.data
  })

  return json({ assets })
}

export default function AssetsPage() {
  const { assets } = useLoaderData<typeof loader>()
  const navigate = useNavigate()

  let previousPageUrl = '',
    nextPageUrl = ''

  if (assets.pageInfo.hasPreviousPage) {
    previousPageUrl = `/assets?before=${assets.pageInfo.startCursor}`
  }

  if (assets.pageInfo.hasNextPage) {
    nextPageUrl = `/assets?after=${assets.pageInfo.endCursor}`
  }

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
          <THead columns={['ID', 'Code', 'Scale', 'Withdrawl threshold']} />
          <TBody>
            {assets.edges.length ? (
              assets.edges.map((asset) => (
                <TRow
                  key={asset.node.id}
                  className='cursor-pointer'
                  onClick={() => navigate(`/assets/${asset.node.id}`)}
                >
                  <TCell>{asset.node.id}</TCell>
                  <TCell>{asset.node.code}</TCell>
                  <TCell>{asset.node.scale}</TCell>
                  <TCell>
                    {asset.node.withdrawalThreshold ? (
                      asset.node.withdrawalThreshold
                    ) : (
                      <span className='italic font-light'>
                        No withdrawal threshold
                      </span>
                    )}
                  </TCell>
                </TRow>
              ))
            ) : (
              <TRow>
                <TCell colSpan={4} className='text-center'>
                  No assets found.
                </TCell>
              </TRow>
            )}
          </TBody>
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
