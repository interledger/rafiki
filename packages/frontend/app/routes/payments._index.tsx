import { json, type LoaderArgs } from '@remix-run/node'
import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react'
import { PageHeader } from '~/components'
import { PopoverFilter } from '~/components/Filters'
import { Button, Table } from '~/components/ui'
import { listPayments } from '~/lib/api/payments.server'
import { paymentsSearchParams } from '~/lib/validate.server'
import { PaymentType } from '~/shared/enums'

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

  console.log({ type })

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

  console.log(json({ payments, previousPageUrl, nextPageUrl }))

  return json({ payments, previousPageUrl, nextPageUrl, type })
}

export default function PaymentsPage() {
  const { payments, previousPageUrl, nextPageUrl, type } =
    useLoaderData<typeof loader>()
  const [searchParams, setSearchParams] = useSearchParams()
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

  const formatPaymentType = (type: PaymentType) => {
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
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
                  name: formatPaymentType(value),
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
          <Table.Head columns={['ID', 'Type']} />
          <Table.Body>
            {payments.edges.length ? (
              payments.edges.map((payments) => (
                <Table.Row
                  key={payments.node.id}
                  className='cursor-pointer'
                  onClick={() => navigate(`/payments/${payments.node.id}`)}
                >
                  <Table.Cell>{payments.node.id}</Table.Cell>
                  <Table.Cell>
                    {formatPaymentType(payments.node.type)}
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
