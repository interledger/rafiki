import { json, type LoaderArgs } from '@remix-run/node'
import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react'
import { Badge, BadgeColor, PageHeader } from '~/components'
import { PopoverFilter } from '~/components/Filters'
import { Button, Table } from '~/components/ui'
import { listPayments } from '~/lib/api/payments.server'
import { paymentsSearchParams } from '~/lib/validate.server'
import { PaymentType } from '~/generated/graphql'
import {
  capitalize,
  badgeColorByState,
  CombinedPaymentState
} from '~/shared/utils'

export const loader = async ({ request }: LoaderArgs) => {
  const url = new URL(request.url)
  const searchParams = Object.fromEntries(url.searchParams.entries())

  const result = paymentsSearchParams.safeParse(
    searchParams.type
      ? { ...searchParams, type: searchParams.type.split(',') }
      : searchParams
  )

  if (!result.success) {
    throw json(null, { status: 400, statusText: 'Invalid result.' })
  }

  const { type, ...pagination } = result.data

  const payments = await listPayments({
    ...pagination,
    ...(type ? { filter: { type: { in: type } } } : {})
  })

  let previousPageUrl = '',
    nextPageUrl = ''

  if (payments.pageInfo.hasPreviousPage) {
    previousPageUrl = `/payments?before=${payments.pageInfo.startCursor}`
  }

  if (payments.pageInfo.hasNextPage) {
    nextPageUrl = `/payments?after=${payments.pageInfo.endCursor}`
  }

  return json({ payments, previousPageUrl, nextPageUrl, type })
}

export default function PaymentsPage() {
  const { payments, previousPageUrl, nextPageUrl, type } =
    useLoaderData<typeof loader>()
  const setSearchParams = useSearchParams()[1]

  const navigate = useNavigate()

  function setTypeFilterParams(selectedType: PaymentType): void {
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

  const paymentSubpathByType: {
    [key in PaymentType]: string
  } = {
    [PaymentType.Incoming]: 'incoming',
    [PaymentType.Outgoing]: 'outgoing'
  }

  return (
    <div className='pt-4 flex flex-col space-y-8'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <div className='flex-1'>
            <h3 className='text-2xl'>Payments</h3>
          </div>
        </PageHeader>
        <div className='p-1'>
          <h3 className='text-lg font-bold'>Filters</h3>
          <div className='flex items-center'>
            <PopoverFilter
              label='Payment type'
              values={type.length > 0 ? type : ['all']}
              options={[
                {
                  name: 'All',
                  value: 'all',
                  action: () => {
                    navigate(``)
                  }
                },
                ...Object.values(PaymentType).map((value) => ({
                  name: capitalize(value),
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
          <Table.Head columns={['ID', 'Type', 'State']} />
          <Table.Body>
            {payments.edges.length ? (
              payments.edges.map((payment) => (
                <Table.Row
                  key={payment.node.id}
                  className='cursor-pointer'
                  onClick={() => {
                    const subpath = paymentSubpathByType[payment.node.type]
                    return navigate(`/payments/${subpath}/${payment.node.id}`)
                  }}
                >
                  <Table.Cell>{payment.node.id}</Table.Cell>
                  <Table.Cell>{capitalize(payment.node.type)}</Table.Cell>
                  <Table.Cell>
                    {
                      <Badge
                        color={
                          badgeColorByState[
                            payment.node.state as CombinedPaymentState
                          ]
                        }
                      >
                        {payment.node.state}
                      </Badge>
                    }
                  </Table.Cell>
                </Table.Row>
              ))
            ) : (
              <Table.Row>
                <Table.Cell colSpan={4} className='text-center'>
                  No payments found.
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
        <div className='flex items-center justify-between p-5'>
          <Button
            aria-label='go to previous page'
            disabled={!payments.pageInfo.hasPreviousPage}
            onClick={() => {
              navigate(previousPageUrl)
            }}
          >
            Previous
          </Button>
          <Button
            aria-label='go to next page'
            disabled={!payments.pageInfo.hasNextPage}
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
