import type { LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, Outlet, useLoaderData } from '@remix-run/react'
import { z } from 'zod'
import { Badge } from '~/components'
import { Box, Button, Card, Flex, Heading, Text } from '@radix-ui/themes'
import { OutgoingPaymentState } from '~/generated/graphql'
import { getOutgoingPayment } from '~/lib/api/payments.server'
import {
  badgeColorByPaymentState,
  formatAmount,
  prettify
} from '~/shared/utils'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export type LiquidityActionOutletContext = {
  withdrawLiquidityDisplayAmount: string
  depositLiquidityDisplayAmount: string
}[]

export async function loader({ request, params }: LoaderFunctionArgs) {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const outgoingPaymentId = params.outgoingPaymentId

  const result = z.string().uuid().safeParse(outgoingPaymentId)
  if (!result.success) {
    throw json(null, {
      status: 400,
      statusText: 'Outgoing payment ID is not valid.'
    })
  }

  const outgoingPayment = await getOutgoingPayment(request, { id: result.data })

  if (!outgoingPayment) {
    throw json(null, { status: 400, statusText: 'Outgoing payment not found.' })
  }

  return json({ outgoingPayment })
}

export default function ViewOutgoingPaymentPage() {
  const { outgoingPayment } = useLoaderData<typeof loader>()

  const withdrawLiquidityDisplayAmount = `${formatAmount(
    outgoingPayment.liquidity ?? '0',
    outgoingPayment.sentAmount.assetScale
  )} ${outgoingPayment.sentAmount.assetCode}`

  const outletContext: LiquidityActionOutletContext = [
    {
      withdrawLiquidityDisplayAmount,
      depositLiquidityDisplayAmount: `${formatAmount(
        outgoingPayment.debitAmount.value,
        outgoingPayment.debitAmount.assetScale
      )} ${outgoingPayment.debitAmount.assetCode}`
    }
  ]

  return (
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Flex justify='between' align='center'>
          <Heading size='5'>Outgoing Payment Details</Heading>
          <Button asChild>
            <Link aria-label='go back to payments page' to='/payments'>
              Go to payments page
            </Link>
          </Button>
        </Flex>

        <Card className='max-w-3xl'>
          <Flex direction='column' gap='5'>
            {/* General Information */}
            <Flex direction='column' gap='4'>
              <Flex align='center' justify='between' gap='3' wrap='wrap'>
                <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                  General Information
                </Text>
                <Text size='2' color='gray'>
                  Created at {new Date(outgoingPayment.createdAt).toLocaleString()}
                </Text>
              </Flex>

              <Flex direction='column' gap='3'>
                <Box>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Outgoing Payment ID
                  </Text>
                  <Text size='2' className='mt-1'>
                    {outgoingPayment.id}
                  </Text>
                </Box>

                <Box>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Wallet Address ID
                  </Text>
                  <Link
                    to={`/wallet-addresses/${outgoingPayment.walletAddressId}`}
                    className='default-link text-sm'
                  >
                    {outgoingPayment.walletAddressId}
                  </Link>
                </Box>

                <Box>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    State
                  </Text>
                  <Box className='mt-1'>
                    <Badge color={badgeColorByPaymentState[outgoingPayment.state]}>
                      {outgoingPayment.state}
                    </Badge>
                  </Box>
                </Box>

                <Box>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Receiver
                  </Text>
                  <Link className='default-link text-sm' to={outgoingPayment.receiver}>
                    {outgoingPayment.receiver}
                  </Link>
                </Box>

                <Box>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Receive Amount
                  </Text>
                  <Text size='2' className='mt-1'>
                    {formatAmount(
                      outgoingPayment.receiveAmount.value,
                      outgoingPayment.receiveAmount.assetScale
                    )}{' '}
                    {outgoingPayment.receiveAmount.assetCode}
                  </Text>
                </Box>

                <Box>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Debit Amount
                  </Text>
                  <Text size='2' className='mt-1'>
                    {formatAmount(
                      outgoingPayment.debitAmount.value,
                      outgoingPayment.debitAmount.assetScale
                    )}{' '}
                    {outgoingPayment.debitAmount.assetCode}
                  </Text>
                </Box>

                <Box>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Sent Amount
                  </Text>
                  <Text size='2' className='mt-1'>
                    {formatAmount(
                      outgoingPayment.sentAmount.value,
                      outgoingPayment.sentAmount.assetScale
                    )}{' '}
                    {outgoingPayment.sentAmount.assetCode}
                  </Text>
                </Box>

                <Box>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Error
                  </Text>
                  {outgoingPayment.error ? (
                    <Text size='2' className='mt-1 text-red-500'>
                      {outgoingPayment.error}
                    </Text>
                  ) : (
                    <Text size='2' className='mt-1 italic'>
                      None
                    </Text>
                  )}
                </Box>

                <Box>
                  {outgoingPayment.metadata ? (
                    <details>
                      <summary className='cursor-pointer font-medium text-sm text-gray-700'>
                        Metadata
                      </summary>
                      <pre
                        className='mt-1 text-sm'
                        dangerouslySetInnerHTML={{
                          __html: prettify(outgoingPayment.metadata)
                        }}
                      />
                    </details>
                  ) : (
                    <>
                      <Text size='2' weight='medium' className='text-gray-700'>
                        Metadata
                      </Text>
                      <Text size='2' className='mt-1 italic'>
                        None
                      </Text>
                    </>
                  )}
                </Box>
              </Flex>
            </Flex>

            {/* Liquidity Information */}
            <Flex direction='column' gap='4'>
              <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                Liquidity Information
              </Text>
              <Flex justify='between' align='center'>
                <Box>
                  <Text weight='medium'>Amount</Text>
                  <Text size='2' color='gray'>
                    {withdrawLiquidityDisplayAmount}
                  </Text>
                </Box>
                <Flex gap='3'>
                  {BigInt(outgoingPayment.liquidity ?? '0') ? (
                    <Button asChild>
                      <Link
                        aria-label='withdraw outgoing payment liquidity page'
                        preventScrollReset
                        to={`/payments/outgoing/${outgoingPayment.id}/withdraw-liquidity`}
                      >
                        Withdraw liquidity
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      disabled={true}
                      aria-label='withdraw outgoing payment liquidity page'
                    >
                      Withdraw liquidity
                    </Button>
                  )}
                  {outgoingPayment.state === OutgoingPaymentState.Funding ? (
                    <Button asChild>
                      <Link
                        aria-label='deposit outgoing payment liquidity page'
                        preventScrollReset
                        to={`/payments/outgoing/${outgoingPayment.id}/deposit-liquidity`}
                      >
                        Deposit liquidity
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      disabled={true}
                      aria-label='deposit outgoing payment liquidity page'
                    >
                      Deposit liquidity
                    </Button>
                  )}
                </Flex>
              </Flex>
            </Flex>
          </Flex>
        </Card>
      </Flex>
      <Outlet context={outletContext} />
    </Box>
  )
}
