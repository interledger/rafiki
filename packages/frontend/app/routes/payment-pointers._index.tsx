import { json, type LoaderArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { Badge, PageHeader } from '~/components'
import { Button, Table } from '~/components/ui'
import { listPaymentPointers } from '~/lib/api/payment-pointer.server'
import { paginationSchema } from '~/lib/validate.server'

export const loader = async ({ request }: LoaderArgs) => {
  const url = new URL(request.url)
  const pagination = paginationSchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  )

  if (!pagination.success) {
    throw json(null, { status: 400, statusText: 'Invalid pagination.' })
  }

  const paymentPointers = await listPaymentPointers({
    ...pagination.data
  })

  let previousPageUrl = '',
    nextPageUrl = ''

  if (paymentPointers.pageInfo.hasPreviousPage) {
    previousPageUrl = `/payment-pointers?before=${paymentPointers.pageInfo.startCursor}`
  }

  if (paymentPointers.pageInfo.hasNextPage) {
    nextPageUrl = `/payment-pointers?after=${paymentPointers.pageInfo.endCursor}`
  }

  return json({ paymentPointers, previousPageUrl, nextPageUrl })
}

export default function PaymentPointersPage() {
  const { paymentPointers, previousPageUrl, nextPageUrl } =
    useLoaderData<typeof loader>()
  const navigate = useNavigate()

  return (
    <div className='pt-4 flex flex-col space-y-8'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <div className='flex-1'>
            <h3 className='text-2xl'>Payment Pointers</h3>
          </div>
          <div className='ml-auto'>
            <Button
              to='/payment-pointers/create'
              aria-label='create a new payment pointer'
            >
              Create payment pointer
            </Button>
          </div>
        </PageHeader>
        <Table>
          <Table.Head columns={['Payment pointer', 'Public name', 'Status']} />
          <Table.Body>
            {paymentPointers.edges.length ? (
              paymentPointers.edges.map((pp) => (
                <Table.Row
                  key={pp.node.id}
                  className='cursor-pointer'
                  onClick={() => navigate(`/payment-pointers/${pp.node.id}`)}
                >
                  <Table.Cell>{pp.node.url}</Table.Cell>
                  <Table.Cell>
                    <div className='flex flex-col'>
                      {pp.node.publicName ? (
                        <span className='font-medium'>
                          {pp.node.publicName}
                        </span>
                      ) : (
                        <span className='text-tealish/80'>No public name</span>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge status={pp.node.status} />
                  </Table.Cell>
                </Table.Row>
              ))
            ) : (
              <Table.Row>
                <Table.Cell colSpan={4} className='text-center'>
                  No payment pointers found.
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
        <div className='flex items-center justify-between p-5'>
          <Button
            aria-label='go to previous page'
            disabled={!paymentPointers.pageInfo.hasPreviousPage}
            onClick={() => {
              navigate(previousPageUrl)
            }}
          >
            Previous
          </Button>
          <Button
            aria-label='go to next page'
            disabled={!paymentPointers.pageInfo.hasNextPage}
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
