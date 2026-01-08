import { useState } from 'react'
import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  redirect
} from '@remix-run/node'
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
  Form,
  useActionData
} from '@remix-run/react'
import { Box, Button, Card, Flex, Heading, Table, Badge, Text, TextField } from '@radix-ui/themes'
import { PopoverFilter } from '~/components/Filters'
import { ErrorPanel, FieldError } from '~/components/ui'
import { listPayments } from '~/lib/api/payments.server'
import { paymentsSearchParams } from '~/lib/validate.server'
import { PaymentType } from '~/generated/graphql'
import type { CombinedPaymentState } from '~/shared/utils'
import {
  capitalize,
  badgeColorByPaymentState,
  paymentSubpathByType
} from '~/shared/utils'
import { checkAuthAndRedirect } from '~/lib/kratos_checks.server'
import type { ZodFieldErrors } from '~/shared/types'

interface PaymentSearchParams {
  type: string | null
  walletAddressId: string | null
  before: string | null
  after: string | null
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

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

  const { type, walletAddressId, ...pagination } = result.data

  const payments = await listPayments(request, {
    ...pagination,
    ...(type || walletAddressId
      ? {
          filter: {
            ...(type ? { type: { in: type } } : {}),
            ...(walletAddressId
              ? { walletAddressId: { in: [walletAddressId] } }
              : {})
          }
        }
      : {})
  })

  return json({
    payments,
    type,
    walletAddressId: walletAddressId ?? null
  })
}

export default function PaymentsPage() {
  const { payments, type, walletAddressId } = useLoaderData<typeof loader>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [walletId, setWalletId] = useState(walletAddressId || '')
  const navigate = useNavigate()
  const response = useActionData<typeof action>()

  function updateSearchParams(
    searchParams: URLSearchParams,
    newParams: PaymentSearchParams
  ) {
    ;(Object.keys(newParams) as (keyof PaymentSearchParams)[]).forEach(
      (key) => {
        const value = newParams[key]
        value === undefined || value === null
          ? searchParams.delete(key)
          : searchParams.set(key, value)
      }
    )
    return searchParams
  }

  function updateParams(newParams: PaymentSearchParams) {
    const newSearchParams = updateSearchParams(
      new URLSearchParams(searchParams),
      newParams
    )
    setSearchParams(newSearchParams)
    navigate(`/payments?${newSearchParams.toString()}`)
  }

  function setTypeFilterParams(selectedType: PaymentType): void {
    const selectedTypes = type
    const newTypes = selectedTypes.includes(selectedType)
      ? selectedTypes.filter((t) => t !== selectedType)
      : [...selectedTypes, selectedType]

    updateParams({
      type: newTypes.length > 0 ? newTypes.join(',') : null,
      before: null,
      after: null,
      walletAddressId
    })
  }

  return (
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Heading size='6'>Payments</Heading>

        <Flex direction='column' gap='3'>
          <Heading size='4'>Filters</Heading>
          <ErrorPanel errors={response?.errors.message} />

          <Flex direction='column' gap='2'>
            <PopoverFilter
              label='Payment type'
              values={type.length > 0 ? type : ['all']}
              options={[
                {
                  name: 'All',
                  value: 'all',
                  action: () =>
                    updateParams({
                      type: null,
                      before: null,
                      after: null,
                      walletAddressId
                    })
                },
                ...Object.values(PaymentType).map((value) => ({
                  name: capitalize(value),
                  value: value,
                  action: () => setTypeFilterParams(value)
                }))
              ]}
            />

            <Form
              method='post'
              onSubmit={(e) => {
                if (!walletId) {
                  e.preventDefault()
                  updateParams({
                    walletAddressId: null,
                    type: searchParams.get('type'),
                    before: null,
                    after: null
                  })
                }
              }}
            >
              <Flex gap='2' align='center'>
                <TextField.Root
                  name='walletAddressId'
                  placeholder='Wallet address ID'
                  style={{ width: '400px' }}
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                />
                <input
                  name='type'
                  type='hidden'
                  value={searchParams.get('type') ?? ''}
                />
                <Button type='submit'>
                  <svg
                    xmlns='http://www.w3.org/2000/svg'
                    width='16'
                    height='16'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      d='M21 21l-4.35-4.35M17.25 10.5a6.75 6.75 0 11-13.5 0 6.75 6.75 0 0113.5 0z'
                    />
                  </svg>
                </Button>
              </Flex>
              <FieldError
                error={response?.errors?.fieldErrors.walletAddressId}
              />
            </Form>
          </Flex>

          <Button
            variant='soft'
            onClick={() => {
              navigate('/payments')
              setWalletId('')
              setSearchParams(new URLSearchParams())
            }}
          >
            Reset Filters
          </Button>
        </Flex>

        <Card>
          <Flex direction='column' gap='4'>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>State</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {payments.edges.length ? (
                  payments.edges.map((payment) => (
                    <Table.Row
                      key={payment.node.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        const subpath = paymentSubpathByType[payment.node.type]
                        return navigate(`/payments/${subpath}/${payment.node.id}`)
                      }}
                    >
                      <Table.Cell>
                        <Text>{payment.node.id}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text weight='medium'>{capitalize(payment.node.type)}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge
                          color={
                            badgeColorByPaymentState[
                              payment.node.state as CombinedPaymentState
                            ]
                          }
                        >
                          {payment.node.state}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text>{new Date(payment.node.createdAt).toLocaleString()}</Text>
                      </Table.Cell>
                    </Table.Row>
                  ))
                ) : (
                  <Table.Row>
                    <Table.Cell colSpan={4} align='center'>
                      <Text>No payments found.</Text>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Root>

            <Flex justify='between' pt='2'>
              <Button
                variant='soft'
                disabled={!payments.pageInfo.hasPreviousPage}
                onClick={() =>
                  updateParams({
                    before: payments.pageInfo.startCursor ?? null,
                    after: null,
                    walletAddressId,
                    type: searchParams.get('type')
                  })
                }
              >
                Previous
              </Button>
              <Button
                variant='soft'
                disabled={!payments.pageInfo.hasNextPage}
                onClick={() =>
                  updateParams({
                    before: null,
                    after: payments.pageInfo.endCursor ?? null,
                    walletAddressId,
                    type: searchParams.get('type')
                  })
                }
              >
                Next
              </Button>
            </Flex>
          </Flex>
        </Card>
      </Flex>
    </Box>
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const errors: {
    fieldErrors: ZodFieldErrors<typeof paymentsSearchParams>
    message: string[]
  } = {
    fieldErrors: {},
    message: []
  }

  const formData = Object.fromEntries(await request.formData())

  const result = paymentsSearchParams.safeParse(
    formData.type
      ? { ...formData, type: formData.type.toString().split(',') }
      : { ...formData, type: [] }
  )

  if (!result.success) {
    errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ errors }, { status: 400 })
  }

  const searchParams = new URLSearchParams()

  if (result.data.walletAddressId) {
    searchParams.append('walletAddressId', result.data.walletAddressId)
  }

  if (result.data.type.length > 0) {
    searchParams.append('type', result.data.type.join(','))
  }

  return redirect(`/payments?${searchParams.toString()}`)
}
