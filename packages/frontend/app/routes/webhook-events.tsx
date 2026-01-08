import { json, type LoaderFunctionArgs } from '@remix-run/node'
import {
  Outlet,
  useLoaderData,
  useNavigate,
  useSearchParams
} from '@remix-run/react'
import { Box, Button, Card, Flex, Heading, Table, Text } from '@radix-ui/themes'
import { PopoverFilter } from '~/components/Filters'
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
      <Box p='4'>
        <Flex direction='column' gap='4'>
          <Heading size='6'>Webhook Events</Heading>

          <Flex direction='column' gap='3'>
            <Heading size='4'>Filters</Heading>
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
          </Flex>

          <Card>
            <Flex direction='column' gap='4'>
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Data</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {webhooks.edges.length ? (
                    webhooks.edges.map((webhook) => (
                      <Table.Row key={webhook.node.id}>
                        <Table.Cell>
                          <Text>{webhook.node.id}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text weight='medium'>{webhook.node.type}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text>{new Date(webhook.node.createdAt).toLocaleString()}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Button
                            variant='soft'
                            onClick={() => {
                              navigate(`/webhook-events/data${
                                searchParams ? `?${searchParams}` : ''
                              }`, {
                                state: {
                                  data: {
                                    ...webhook.node.data,
                                    tenantId: webhook.node.tenantId
                                  }
                                }
                              })
                            }}
                          >
                            View data
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))
                  ) : (
                    <Table.Row>
                      <Table.Cell colSpan={4} align='center'>
                        <Text>No webhook events found.</Text>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Root>

              <Flex justify='between' pt='2'>
                <Button
                  variant='soft'
                  disabled={!webhooks.pageInfo.hasPreviousPage}
                  onClick={() => {
                    navigate(previousPageUrl)
                  }}
                >
                  Previous
                </Button>
                <Button
                  variant='soft'
                  disabled={!webhooks.pageInfo.hasNextPage}
                  onClick={() => {
                    navigate(nextPageUrl)
                  }}
                >
                  Next
                </Button>
              </Flex>
            </Flex>
          </Card>
        </Flex>
      </Box>
      <Outlet />
    </>
  )
}
