import { json, type LoaderArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import PageHeader from '~/components/PageHeader'
import { Button } from '~/components/ui/Button'
import { Table, TBody, TCell, THead, TRow } from '~/components/ui/Table'
import { paginationSchema } from '~/lib/validate.server'
import { peerService } from '~/services/bootstrap.server'

export const loader = async ({ request }: LoaderArgs) => {
  const url = new URL(request.url)
  const pagination = paginationSchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  )

  if (!pagination.success) {
    throw new Error('Invalid pagination.')
  }

  const peers = await peerService.list({
    ...pagination.data
  })

  console.log(peers)

  return json({ peers })
}

export default function PeersPage() {
  const { peers } = useLoaderData<typeof loader>()
  const navigate = useNavigate()

  let previousPageUrl = '',
    nextPageUrl = ''

  if (peers.pageInfo.hasPreviousPage) {
    previousPageUrl = `/peers?before=${peers.pageInfo.startCursor}`
  }

  if (peers.pageInfo.hasNextPage) {
    nextPageUrl = `/peers?after=${peers.pageInfo.endCursor}`
  }

  return (
    <div className='pt-4 flex flex-col space-y-8'>
      {/* Peers Table */}
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <div className='flex-1'>
            <h3 className='text-2xl'>Peers</h3>
          </div>
          <div className='ml-auto'>
            <Button to='/peers/create' aria-label='create a new peer'>
              Create peer
            </Button>
          </div>
        </PageHeader>
        <Table>
          <THead
            columns={['Name', 'ILP Address', 'Asset', 'Outgoing HTTP Endpoint']}
          />
          <TBody>
            {peers.edges.map((peer) => (
              <TRow
                key={peer.node.id}
                className='cursor-pointer'
                onClick={() => navigate(`/peers/${peer.node.id}`)}
              >
                <TCell>
                  <div className='flex flex-col'>
                    {peer.node.name ? (
                      <span className='font-medium'>{peer.node.name}</span>
                    ) : (
                      <span className='text-tealish/80'>No peer name</span>
                    )}
                    <div className='text-tealish/50 text-xs'>
                      (ID: {peer.node.id})
                    </div>
                  </div>
                </TCell>
                <TCell>{peer.node.staticIlpAddress}</TCell>
                <TCell>
                  {peer.node.asset.code} (Scale: {peer.node.asset.scale})
                </TCell>
                <TCell>{peer.node.http.outgoing.endpoint}</TCell>
              </TRow>
            ))}
          </TBody>
        </Table>
        {/* Pagination */}
        <div className='flex items-center justify-between p-5'>
          <Button
            aria-label='go to previous page'
            disabled={!peers.pageInfo.hasPreviousPage}
            onClick={() => {
              navigate(previousPageUrl)
            }}
          >
            Previous
          </Button>
          <Button
            aria-label='go to next page'
            disabled={!peers.pageInfo.hasNextPage}
            onClick={() => {
              navigate(nextPageUrl)
            }}
          >
            Next
          </Button>
        </div>
        {/* Pagination - END */}
      </div>
      {/* Peers Table - END*/}
    </div>
  )
}
