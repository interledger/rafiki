import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { Box, Button, Flex, Heading, Table, Text } from '@radix-ui/themes'
import { listAssets } from '~/lib/api/asset.server'
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

  const assets = await listAssets(request, {
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
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Flex justify='between' align='center'>
          <Heading size='5'>Assets</Heading>
          <Button onClick={() => navigate('/assets/create')}>
            Add asset
          </Button>
        </Flex>

        <Flex direction='column' gap='4'>
          <Box className='overflow-hidden rounded-md border border-pearl bg-white'>
            <Table.Root>
              <Table.Header className='bg-pearl/40'>
                <Table.Row>
                  <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Code</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Scale</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Withdrawal threshold</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
              {assets.edges.length ? (
                assets.edges.map((asset) => (
                  <Table.Row
                    key={asset.node.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/assets/${asset.node.id}`)}
                  >
                    <Table.Cell>
                      <Text size='2'>{asset.node.id}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text weight='medium'>{asset.node.code}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text>{asset.node.scale}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      {asset.node.withdrawalThreshold ? (
                        <Text>{asset.node.withdrawalThreshold}</Text>
                      ) : (
                        <Text color='gray'>No withdrawal threshold</Text>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))
              ) : (
                <Table.Row>
                  <Table.Cell colSpan={4} align='center'>
                    <Text>No assets found.</Text>
                  </Table.Cell>
                </Table.Row>
              )}
              </Table.Body>
            </Table.Root>
          </Box>

          <Flex justify='between' pt='2'>
            <Button
              variant='soft'
              disabled={!assets.pageInfo.hasPreviousPage}
              onClick={() => navigate(previousPageUrl)}
            >
              Previous
            </Button>
            <Button
              variant='soft'
              disabled={!assets.pageInfo.hasNextPage}
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
