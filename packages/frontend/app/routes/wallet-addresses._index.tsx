import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { Box, Button, Card, Flex, Heading, Table, Badge, Text } from '@radix-ui/themes'
import { listWalletAddresses } from '~/lib/api/wallet-address.server'
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

const statusColorMap: Record<string, 'green' | 'red' | 'gray'> = {
  ACTIVE: 'green',
  INACTIVE: 'red'
}

export default function WalletAddressesPage() {
  const { walletAddresses, previousPageUrl, nextPageUrl } =
    useLoaderData<typeof loader>()
  const navigate = useNavigate()

  return (
    <Box p='4'>
      <Card>
        <Flex direction='column' gap='4'>
          <Flex justify='between' align='center'>
            <Heading size='6'>Wallet Addresses</Heading>
            <Button onClick={() => navigate('/wallet-addresses/create')}>
              Create wallet address
            </Button>
          </Flex>

          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Wallet address</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Public name</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {walletAddresses.edges.length ? (
                walletAddresses.edges.map((wa) => (
                  <Table.Row
                    key={wa.node.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/wallet-addresses/${wa.node.id}`)}
                  >
                    <Table.Cell>
                      <Text>{wa.node.address}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text weight='medium'>
                        {wa.node.publicName || 'No public name'}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={statusColorMap[wa.node.status] || 'gray'}>
                        {wa.node.status}
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                ))
              ) : (
                <Table.Row>
                  <Table.Cell colSpan={3} align='center'>
                    <Text>No wallet addresses found.</Text>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Root>

          <Flex justify='between' pt='2'>
            <Button
              variant='soft'
              disabled={!walletAddresses.pageInfo.hasPreviousPage}
              onClick={() => navigate(previousPageUrl)}
            >
              Previous
            </Button>
            <Button
              variant='soft'
              disabled={!walletAddresses.pageInfo.hasNextPage}
              onClick={() => navigate(nextPageUrl)}
            >
              Next
            </Button>
          </Flex>
        </Flex>
      </Card>
    </Box>
  )
}
