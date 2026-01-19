import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { Box, Button, Flex, Heading, Table, Text } from '@radix-ui/themes'
import { listPeers } from '~/lib/api/peer.server'
import { paginationSchema } from '~/lib/validate.server'
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

  const peers = await listPeers(request, {
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
  const { peers, previousPageUrl, nextPageUrl} = useLoaderData<typeof loader>()
  const navigate = useNavigate()

  return (
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Flex justify='between' align='start'>
          <Heading size='5'>Peers</Heading>
          <Button onClick={() => navigate('/peers/create')}>
            Create peer
          </Button>
        </Flex>

        <Flex direction='column' gap='4'>
          <Box className='overflow-hidden rounded-md border border-pearl bg-white'>
            <Table.Root>
              <Table.Header className='bg-pearl/40'>
              <Table.Row>
                <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>ILP Address</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Asset</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Outgoing HTTP Endpoint</Table.ColumnHeaderCell>
              </Table.Row>
              </Table.Header>
              <Table.Body>
              {peers.edges.length ? (
                peers.edges.map((peer) => (
                  <Table.Row
                    key={peer.node.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/peers/${peer.node.id}`)}
                  >
                    <Table.Cell>
                      <Flex direction='column' gap='1'>
                        <Text weight='medium'>
                          {peer.node.name || 'No peer name'}
                        </Text>
                        <Text size='1' color='gray'>
                          (ID: {peer.node.id})
                        </Text>
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>
                      <Text>{peer.node.staticIlpAddress}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text>
                        {peer.node.asset.code} (Scale: {peer.node.asset.scale})
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text>{peer.node.http.outgoing.endpoint}</Text>
                    </Table.Cell>
                  </Table.Row>
                ))
              ) : (
                <Table.Row>
                  <Table.Cell colSpan={4} align='center'>
                    <Text>No peers found.</Text>
                  </Table.Cell>
                </Table.Row>
              )}
              </Table.Body>
            </Table.Root>
          </Box>

          <Flex justify='between' pt='2'>
            <Button
              variant='soft'
              disabled={!peers.pageInfo.hasPreviousPage}
              onClick={() => navigate(previousPageUrl)}
            >
              Previous
            </Button>
            <Button
              variant='soft'
              disabled={!peers.pageInfo.hasNextPage}
              onClick={() => navigate(nextPageUrl)}
            >
              Next
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Box>
  )
}
