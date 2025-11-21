import { json, type LoaderFunctionArgs } from '@remix-run/node'
import {
  Outlet,
  useLoaderData,
  useNavigate,
  useSearchParams
} from '@remix-run/react'
import { PageHeader } from '~/components'
import { PopoverFilter } from '~/components/Filters'
import { Button, Table } from '~/components/ui'
import { listWebhooks } from '~/lib/api/webhook.server'
import { webhooksSearchParams } from '~/lib/validate.server'
import { WebhookEventType } from '~/shared/enums'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const url = new URL(request.url)
  const searchParams = Object.fromEntries(url.searchParams.entries())
  const result = webhooksSearchParams.safeParse(
    searchParams.type
      ? { ...searchParams, type: searchParams.type.split(',') }
      : searchParams
  )

  if (!result.success) {
    throw json(null, { status: 400, statusText: 'Invalid result.' })
  }

  const { type, ...pagination } = result.data
  const webhooks = await listWebhooks(request, {
    ...pagination,
    ...(type ? { filter: { type: { in: type } } } : {})
  })

  let previousPageUrl = '',
    nextPageUrl = ''

  if (webhooks.pageInfo.hasPreviousPage && webhooks.pageInfo.startCursor) {
    const previousPageSearchParams = new URLSearchParams()
    previousPageSearchParams.set('before', webhooks.pageInfo.startCursor)
    if (type.length > 0) previousPageSearchParams.set('type', type.join(','))
    previousPageUrl = `/webhook-events?${previousPageSearchParams.toString()}`
  }

  if (webhooks.pageInfo.hasNextPage && webhooks.pageInfo.endCursor) {
    const nextPageSearchParams = new URLSearchParams()
    nextPageSearchParams.set('after', webhooks.pageInfo.endCursor)
    if (type.length > 0) nextPageSearchParams.set('type', type.join(','))
    nextPageUrl = `/webhook-events?${nextPageSearchParams.toString()}`
  }

  return json({ webhooks, previousPageUrl, nextPageUrl, type })
}

export default function WebhookEventsPage() {
  const { webhooks, previousPageUrl, nextPageUrl, type } =
    useLoaderData<typeof loader>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  function setTypeFilterParams(selectedType: WebhookEventType): void {
    const selected = type

    if (!selected.includes(selectedType)) {
      selected.push(selectedType)
      setSearchParams(new URLSearchParams({ type: selected.join(',') }))
      return
    }

    setSearchParams(() => {
      const newParams = selected.filter((t) => t !== selectedType).join(',')
      if (newParams.length === 0) {
        return ''
      }

      return new URLSearchParams({
        type: newParams
      })
    })
  }

  return (
    <>
      <div className='pt-4 flex flex-col space-y-8'>
        <div className='flex flex-col rounded-md bg-offwhite px-6'>
          <PageHeader>
            <div className='flex-1'>
              <h3 className='text-2xl leading-10'>Webhook Events</h3>
            </div>
          </PageHeader>
          <div className='p-1'>
            <h3 className='text-lg font-bold'>Filters</h3>
            <div className='flex items-center'>
              <PopoverFilter
                label='Event type'
                values={type.length > 0 ? type : ['all']}
                options={[
                  {
                    name: 'All',
                    value: 'all',
                    action: () => {
                      navigate(``)
                    }
                  },
                  ...Object.values(WebhookEventType).map((value) => ({
                    name:
                      value.charAt(0).toUpperCase() +
                      value.slice(1).replace(/[_.]/g, ' '),
                    value: value,
                    action: () => {
                      setTypeFilterParams(value)
                    }
                  }))
                ]}
              />
            </div>
          </div>
          <Table>
            <Table.Head columns={['ID', 'Type', 'Date', 'Data']} />
            <Table.Body>
              {webhooks.edges.length ? (
                webhooks.edges.map((webhook) => (
                  <Table.Row key={webhook.node.id}>
                    <Table.Cell>{webhook.node.id}</Table.Cell>
                    <Table.Cell>{webhook.node.type}</Table.Cell>
                    <Table.Cell>
                      {new Date(webhook.node.createdAt).toLocaleString()}
                    </Table.Cell>
                    <Table.Cell>
                      <Button
                        aria-label='view webhook data'
                        state={{
                          data: {
                            ...webhook.node.data,
                            tenantId: webhook.node.tenantId
                          }
                        }}
                        to={`/webhook-events/data${
                          searchParams ? `?${searchParams}` : null
                        }`}
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
