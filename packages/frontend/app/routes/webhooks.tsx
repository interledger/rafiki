import { json, type LoaderArgs } from '@remix-run/node'
import { Outlet, useLoaderData, useNavigate } from '@remix-run/react'
import { PageHeader } from '~/components'
import { DropdownFilter } from '~/components/Filters'
import { Button, Table } from '~/components/ui'
import { listWebhooks } from '~/lib/api/webhook.server'
import { webhooksSearchParams } from '~/lib/validate.server'
import { WebhookEventType } from '~/shared/enums'

export const loader = async ({ request }: LoaderArgs) => {
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
  const webhooks = await listWebhooks({
    ...pagination,
    ...(type ? { filter: { type: { in: type } } } : {})
  })

  let previousPageUrl = '',
    nextPageUrl = ''

  if (webhooks.pageInfo.hasPreviousPage) {
    previousPageUrl = `/webhooks?before=${webhooks.pageInfo.startCursor}`
  }

  if (webhooks.pageInfo.hasNextPage) {
    nextPageUrl = `/webhooks?after=${webhooks.pageInfo.endCursor}`
  }

  return json({ webhooks, previousPageUrl, nextPageUrl, type })
}

export default function WebhookEventsPage() {
  const { webhooks, previousPageUrl, nextPageUrl, type } =
    useLoaderData<typeof loader>()
  const navigate = useNavigate()
  function getTypeFilterParams(
    currentTypeParams: WebhookEventType[] | undefined,
    selectedType: WebhookEventType | undefined
  ): string {
    const selectedTypeSet = currentTypeParams
      ? new Set(currentTypeParams)
      : new Set<WebhookEventType>()
    if (selectedType) {
      selectedTypeSet.has(selectedType)
        ? selectedTypeSet.delete(selectedType)
        : selectedTypeSet.add(selectedType)
    }

    return selectedTypeSet.size > 0
      ? `?type=${[...selectedTypeSet].join(',')}`
      : ''
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
              <DropdownFilter
                label='Type'
                values={type ? type : ['all']}
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
                      navigate(`${getTypeFilterParams(type, value)}`)
                    }
                  }))
                ]}
              />
            </div>
          </div>
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
                navigate(
                  previousPageUrl +
                    getTypeFilterParams(type, undefined).replace('?', '&')
                )
              }}
            >
              Previous
            </Button>
            <Button
              aria-label='go to next page'
              disabled={!webhooks.pageInfo.hasNextPage}
              onClick={() => {
                navigate(
                  nextPageUrl +
                    getTypeFilterParams(type, undefined).replace('?', '&')
                )
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
