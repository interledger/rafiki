import { json, type LoaderArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { PageHeader } from '~/components'
import { Button, Table } from '~/components/ui'
import { listPeers } from '~/lib/api/peer.server'
import { paginationSchema } from '~/lib/validate.server'

export const loader = async ({ request }: LoaderArgs) => {
  const url = new URL(request.url)
  const pagination = paginationSchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  )

  if (!pagination.success) {
    throw json(null, { status: 400, statusText: 'Invalid pagination.' })
  }

  const peers = await listPeers({
    ...pagination.data
  })

  let previousPageUrl = '',
    nextPageUrl = ''

  if (peers.pageInfo.hasPreviousPage) {
    previousPageUrl = `/peers?before=${peers.pageInfo.startCursor}`
  }

  if (peers.pageInfo.hasNextPage) {
    nextPageUrl = `/peers?after=${peers.pageInfo.endCursor}`
  }

  return json({ peers, previousPageUrl, nextPageUrl })
}

export default function PeersPage() {
  const { peers, previousPageUrl, nextPageUrl } = useLoaderData<typeof loader>()
  const navigate = useNavigate()

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
          <Table.Head
            columns={['Name', 'ILP Address', 'Asset', 'Outgoing HTTP Endpoint']}
          />
          <Table.Body>
            {peers.edges.length ? (
              peers.edges.map((peer) => (
                <Table.Row
                  key={peer.node.id}
                  className='cursor-pointer'
                  onClick={() => navigate(`/peers/${peer.node.id}`)}
                >
                  <Table.Cell>
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
                  </Table.Cell>
                  <Table.Cell>{peer.node.staticIlpAddress}</Table.Cell>
                  <Table.Cell>
                    {peer.node.asset.code} (Scale: {peer.node.asset.scale})
                  </Table.Cell>
                  <Table.Cell>{peer.node.http.outgoing.endpoint}</Table.Cell>
                </Table.Row>
              ))
            ) : (
              <Table.Row>
                <Table.Cell colSpan={4} className='text-center'>
                  No peers found.
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
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
