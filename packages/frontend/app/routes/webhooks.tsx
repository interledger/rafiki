import { json, type LoaderArgs } from '@remix-run/node'
import { Outlet, useLoaderData, useNavigate } from '@remix-run/react'
import { PageHeader } from '~/components'
import { Button, Table } from '~/components/ui'
import { listWebhooks } from '~/lib/api/webhook.server'
import { paginationSchema } from '~/lib/validate.server'

export const loader = async ({ request }: LoaderArgs) => {
  const url = new URL(request.url)
  const pagination = paginationSchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  )

  if (!pagination.success) {
    throw json(null, { status: 400, statusText: 'Invalid pagination.' })
  }

  const webhooks = await listWebhooks({
    ...pagination.data
  })

  let previousPageUrl = '',
    nextPageUrl = ''

  if (webhooks.pageInfo.hasPreviousPage) {
    previousPageUrl = `/webhooks?before=${webhooks.pageInfo.startCursor}`
  }

  if (webhooks.pageInfo.hasNextPage) {
    nextPageUrl = `/webhooks?after=${webhooks.pageInfo.endCursor}`
  }

  return json({ webhooks, previousPageUrl, nextPageUrl })
}

export default function WebhookEventsPage() {
  const { webhooks, previousPageUrl, nextPageUrl } =
    useLoaderData<typeof loader>()
  const navigate = useNavigate()

  return (
    <>
      <div className='pt-4 flex flex-col space-y-8'>
        <div className='flex flex-col rounded-md bg-offwhite px-6'>
          <PageHeader>
            <div className='flex-1'>
              <h3 className='text-2xl leading-10'>Webhook Events</h3>
            </div>
          </PageHeader>
          <Table>
            <Table.Head columns={['ID', 'Type', 'Data']} />
            <Table.Body>
              {webhooks.edges.length ? (
                webhooks.edges.map((webhook) => (
                  <Table.Row key={webhook.node.id}>
                    <Table.Cell>{webhook.node.id}</Table.Cell>
                    <Table.Cell>{webhook.node.type}</Table.Cell>
                    <Table.Cell>
                        <Button
                          aria-label='view webhook data'
                          state={{ data: webhook.node.data }}
                          to={'/webhooks/data'}
                        >
                          View data
                        </Button>
                    </Table.Cell>
                  </Table.Row>
                ))
              ) : (
                <Table.Row>
                  <Table.Cell colSpan={4} className='text-center'>
                    No webhook events found.
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
          <div className='flex items-center justify-between p-5'>
            <Button
              aria-label='go to previous page'
              disabled={!webhooks.pageInfo.hasPreviousPage}
              onClick={() => {
                navigate(previousPageUrl)
              }}
            >
              Previous
            </Button>
            <Button
              aria-label='go to next page'
              disabled={!webhooks.pageInfo.hasNextPage}
              onClick={() => {
                navigate(nextPageUrl)
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
      <Outlet />
    </>
  )
}
