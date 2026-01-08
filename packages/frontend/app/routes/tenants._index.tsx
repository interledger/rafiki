import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { Box, Button, Flex, Heading, Table, Badge, Text } from '@radix-ui/themes'
import { getTenantInfo, listTenants, whoAmI } from '~/lib/api/tenant.server'
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

  const me = await whoAmI(request)
  const isOperator = me.isOperator
  const tenants = isOperator
    ? await listTenants(request, {
        ...pagination.data
      })
    : undefined

  let previousPageUrl = '',
    nextPageUrl = ''
  let tenantPageInfo
  let tenantEdges
  if (tenants) {
    if (tenants.pageInfo.hasPreviousPage)
      previousPageUrl = `/tenants?before=${tenants.pageInfo.startCursor}`
    if (tenants.pageInfo.hasNextPage)
      nextPageUrl = `/tenants?after=${tenants.pageInfo.endCursor}`
    tenantPageInfo = tenants.pageInfo
    tenantEdges = tenants.edges
  } else {
    const tenantInfo = await getTenantInfo(request, { id: me.id })
    tenantPageInfo = { hasNextPage: false, hasPreviousPage: false }
    tenantEdges = [{ node: tenantInfo }]
  }

  return json({
    tenantEdges,
    tenantPageInfo,
    previousPageUrl,
    nextPageUrl,
    me
  })
}

export default function TenantsPage() {
  const { tenantEdges, tenantPageInfo, previousPageUrl, nextPageUrl, me } =
    useLoaderData<typeof loader>()
  const navigate = useNavigate()

  return (
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Flex justify='between' align='center'>
          <Box>
            <Heading size='5'>Tenants</Heading>
            <Text size='2' color='gray'>
              Manage your tenants and their access.
            </Text>
          </Box>
          {me.isOperator && (
            <Button onClick={() => navigate('/tenants/create')}>
              Add tenant
            </Button>
          )}
        </Flex>

        <Box className='overflow-hidden rounded-md border border-pearl bg-white'>
          <Table.Root>
            <Table.Header className='bg-pearl/40'>
              <Table.Row>
                <Table.ColumnHeaderCell>Public name</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {tenantEdges.length ? (
                tenantEdges.map((tenant) => (
                  <Table.Row
                    key={tenant.node.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/tenants/${tenant.node.id}`)}
                  >
                    <Table.Cell>
                      <Flex direction='column' gap='1'>
                        <Flex align='center' gap='2'>
                          <Text weight='medium'>
                            {tenant.node.publicName || 'No public name'}
                          </Text>
                          {me.isOperator && me.id == tenant.node.id && (
                            <Badge color='yellow'>Operator</Badge>
                          )}
                        </Flex>
                        <Text size='1' color='gray'>
                          (ID: {tenant.node.id})
                        </Text>
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>
                      <Text weight='medium'>
                        {tenant.node.email || 'No email'}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      {tenant.node.deletedAt ? (
                        <Badge color='red'>Inactive</Badge>
                      ) : (
                        <Badge color='green'>Active</Badge>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))
              ) : (
                <Table.Row>
                  <Table.Cell colSpan={3} align='center'>
                    <Text>No tenants found.</Text>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Root>
        </Box>

        <Flex justify='between' pt='2'>
          <Button
            variant='soft'
            disabled={!tenantPageInfo.hasPreviousPage}
            onClick={() => navigate(previousPageUrl)}
          >
            Previous
          </Button>
          <Button
            variant='soft'
            disabled={!tenantPageInfo.hasNextPage}
            onClick={() => navigate(nextPageUrl)}
          >
            Next
          </Button>
        </Flex>
      </Flex>
    </Box>
  )
}
