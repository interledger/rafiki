import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { Badge, BadgeColor, PageHeader } from '~/components'
import { Button, Table } from '~/components/ui'
import { listTenants } from '~/lib/api/tenant.server'
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

  const tenants = await listTenants(request, {
    ...pagination.data
  })

  let previousPageUrl = '',
    nextPageUrl = ''
  if (tenants.pageInfo.hasPreviousPage)
    previousPageUrl = `/tenants?before=${tenants.pageInfo.startCursor}`
  if (tenants.pageInfo.hasNextPage)
    nextPageUrl = `/tenants?after=${tenants.pageInfo.endCursor}`

  return json({ tenants, previousPageUrl, nextPageUrl })
}

export default function TenantsPage() {
  const { tenants, previousPageUrl, nextPageUrl } =
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
            <Button aria-label='add new tenant' to='/tenants/create'>
              Add tenant
            </Button>
          </div>
        </PageHeader>
        <Table>
          <Table.Head
            columns={['ID', 'Public name', 'Email', 'Status', 'Operator']}
          />
          <Table.Body>
            {tenants.edges.length ? (
              tenants.edges.map((tenant) => (
                <Table.Row
                  key={tenant.node.id}
                  className='cursor-pointer'
                  onClick={() => navigate(`/tenants/${tenant.node.id}`)}
                >
                  <Table.Cell>{tenant.node.id}</Table.Cell>
                  <Table.Cell>
                    <div className='flex flex-col'>
                      {tenant.node.publicName ? (
                        <span className='font-medium'>
                          {tenant.node.publicName}
                        </span>
                      ) : (
                        <span className='text-tealish/80'>No public name</span>
                      )}
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
                  <Table.Cell>
                    {tenant.node.isOperator ? (
                      <span className='font-medium'>Yes</span>
                    ) : (
                      <span className='font-medium'>No</span>
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
            disabled={!tenants.pageInfo.hasPreviousPage}
            onClick={() => {
              navigate(previousPageUrl)
            }}
          >
            Previous
          </Button>
          <Button
            aria-label='go to next page'
            disabled={!tenants.pageInfo.hasNextPage}
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
