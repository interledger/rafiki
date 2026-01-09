import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { paginationSchema } from '~/lib/validate.server'
import { getAssetWithFees } from '~/lib/api/asset.server'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { Box, Button, Flex, Heading, Table, Text } from '@radix-ui/themes'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const assetId = params.assetId
  if (!assetId) {
    throw json(null, { status: 404, statusText: 'Asset not found.' })
  }
  const url = new URL(request.url)
  const pagination = paginationSchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  )

  if (!pagination.success) {
    throw json(null, { status: 400, statusText: 'Invalid pagination.' })
  }

  const asset = await getAssetWithFees(request, {
    ...pagination.data,
    id: assetId
  })

  if (!asset) {
    throw json(null, { status: 404, statusText: 'Asset not found.' })
  }

  let previousPageUrl = '',
    nextPageUrl = ''

  if (asset.fees?.pageInfo.hasPreviousPage) {
    previousPageUrl = `/assets/${assetId}/fee-history?before=${asset.fees.pageInfo.startCursor}`
  }

  if (asset.fees?.pageInfo.hasNextPage) {
    nextPageUrl = `/assets/${assetId}/fee-history?after=${asset.fees.pageInfo.endCursor}`
  }

  return json({ assetId, fees: asset.fees, previousPageUrl, nextPageUrl })
}

export default function AssetFeesPage() {
  const { assetId, fees, previousPageUrl, nextPageUrl } =
    useLoaderData<typeof loader>()
  const navigate = useNavigate()

  return (
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Flex justify='between' align='start'>
          <Heading size='5'>Asset Fees</Heading>
          <Button
            aria-label='back to asset overview'
            onClick={() => {
              navigate(`/assets/${assetId}`)
            }}
          >
            Back to asset
          </Button>
        </Flex>

        <Flex direction='column' gap='4'>
          <Box className='overflow-hidden rounded-md border border-pearl bg-white'>
            <Table.Root>
              <Table.Header className='bg-pearl/40'>
                <Table.Row>
                  <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Fixed</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Basis points</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Creation date</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {fees?.edges.length ? (
                  fees.edges.map((fee) => (
                    <Table.Row key={fee.node.id}>
                      <Table.Cell>
                        <Text size='2'>{fee.node.id}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text>{fee.node.type}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text>{fee.node.fixed}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text>{fee.node.basisPoints}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text>{new Date(fee.node.createdAt).toLocaleString()}</Text>
                      </Table.Cell>
                    </Table.Row>
                  ))
                ) : (
                  <Table.Row>
                    <Table.Cell colSpan={5} align='center'>
                      <Text>No fees found.</Text>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Root>
          </Box>

          <Flex justify='between' pt='2'>
            <Button
              variant='soft'
              aria-label='go to previous page'
              disabled={!fees?.pageInfo.hasPreviousPage}
              onClick={() => {
                navigate(previousPageUrl)
              }}
            >
              Previous
            </Button>
            <Button
              variant='soft'
              aria-label='go to next page'
              disabled={!fees?.pageInfo.hasNextPage}
              onClick={() => {
                navigate(nextPageUrl)
              }}
            >
              Next
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Box>
  )
}
