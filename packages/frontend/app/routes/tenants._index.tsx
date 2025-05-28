import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { Badge, BadgeColor, PageHeader } from '~/components'
import { Button, Table } from '~/components/ui'
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
    <div className='pt-4 flex flex-col space-y-8'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <div className='flex-1'>
            <h3 className='text-2xl'>Tenants</h3>
          </div>
          <div className='ml-auto'>
            {me.isOperator && (
              <Button aria-label='add new tenant' to='/tenants/create'>
                Add tenant
              </Button>
            )}
          </div>
        </PageHeader>
        <Table>
          <Table.Head columns={['Public name', 'Email', 'Status']} />
          <Table.Body>
            {tenantEdges.length ? (
              tenantEdges.map((tenant) => (
                <Table.Row
                  key={tenant.node.id}
                  className='cursor-pointer'
                  onClick={() => navigate(`/tenants/${tenant.node.id}`)}
                >
                  <Table.Cell>
                    <div className='flex flex-col'>
                      <div>
                        <span className='mr-2'>
                          {tenant.node.publicName ? (
                            <span className='font-medium'>
                              {tenant.node.publicName}
                            </span>
                          ) : (
                            <span className='text-tealish/80'>
                              No public name
                            </span>
                          )}
                        </span>
                        {me.isOperator && me.id == tenant.node.id && (
                          <Badge color={BadgeColor.Yellow}>Operator</Badge>
                        )}
                      </div>
                      <div className='text-tealish/50 text-xs'>
                        (ID: {tenant.node.id})
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    {tenant.node.email ? (
                      <span className='font-medium'>{tenant.node.email}</span>
                    ) : (
                      <span className='text-tealish/80'>No email</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {tenant.node.deletedAt ? (
                      <Badge color={BadgeColor.Red}>Inactive</Badge>
                    ) : (
                      <Badge color={BadgeColor.Green}>Active</Badge>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))
            ) : (
              <Table.Row>
                <Table.Cell colSpan={4} className='text-center'>
                  No tenants found.
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
        <div className='flex items-center justify-between p-5'>
          <Button
            aria-label='go to previous page'
            disabled={!tenantPageInfo.hasPreviousPage}
            onClick={() => {
              navigate(previousPageUrl)
            }}
          >
            Previous
          </Button>
          <Button
            aria-label='go to next page'
            disabled={!tenantPageInfo.hasNextPage}
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
