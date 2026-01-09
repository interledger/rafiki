import type { LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, Outlet, useLoaderData } from '@remix-run/react'
import { z } from 'zod'
import { Badge } from '~/components'
import { Box, Button, Card, Flex, Heading, Text } from '@radix-ui/themes'
import { IncomingPaymentState } from '~/generated/graphql'
import { getIncomingPayment } from '~/lib/api/payments.server'
import {
  badgeColorByPaymentState,
  formatAmount,
  prettify
} from '~/shared/utils'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const incomingPaymentId = params.incomingPaymentId

  const result = z.string().uuid().safeParse(incomingPaymentId)
  if (!result.success) {
    throw json(null, {
      status: 400,
      statusText: 'Invalid incoming payment ID.'
    })
  }

  const incomingPayment = await getIncomingPayment(request, { id: result.data })

  if (!incomingPayment) {
    throw json(null, { status: 400, statusText: 'Incoming payment not found.' })
  }

  return json({ incomingPayment })
}

export default function ViewIncomingPaymentPage() {
  const { incomingPayment } = useLoaderData<typeof loader>()

  const canWithdrawLiquidity =
    BigInt(incomingPayment.liquidity ?? '0') &&
    [IncomingPaymentState.Expired, IncomingPaymentState.Completed].includes(
      incomingPayment.state
    )

  const displayLiquidityAmount = `${formatAmount(
    incomingPayment.liquidity ?? '0',
    incomingPayment.receivedAmount.assetScale
  )} ${incomingPayment.receivedAmount.assetCode}`

  const expiresAtLocale = new Date(incomingPayment.expiresAt).toLocaleString()

  return (
    <Box p='4'>
      <Flex direction='column' gap='4'>
        <Heading size='5'>Incoming Payment Details</Heading>

        <Card className='max-w-3xl'>
          <Flex direction='column' gap='4'>
            <Flex align='center' justify='between' gap='3' wrap='wrap'>
              <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
                General Information
              </Text>
              <Flex direction='column' gap='1' align='end'>
                <Text size='2' color='gray'>
                  Created at {new Date(incomingPayment.createdAt).toLocaleString()}
                </Text>
                {new Date(expiresAtLocale) > new Date() && (
                  <Text size='2' color='gray'>
                    Expires at {expiresAtLocale}
                  </Text>
                )}
              </Flex>
            </Flex>

            <Flex direction='column' gap='3'>
              <Flex gap='6' wrap='wrap'>
                <Flex direction='column' gap='1'>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Incoming Payment ID
                  </Text>
                  <Text size='2' color='gray'>
                    {incomingPayment.id}
                  </Text>
                </Flex>

                <Flex direction='column' gap='1'>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Wallet Address ID
                  </Text>
                  <Link
                    to={`/wallet-addresses/${incomingPayment.walletAddressId}`}
                    className='default-link text-sm'
                  >
                    {incomingPayment.walletAddressId}
                  </Link>
                </Flex>

                <Flex direction='column' gap='1'>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    State
                  </Text>
                  <Box>
                    <Badge color={badgeColorByPaymentState[incomingPayment.state]}>
                      {incomingPayment.state}
                    </Badge>
                  </Box>
                </Flex>
              </Flex>

              <Flex gap='6' wrap='wrap' className='w-full'>
                <Flex direction='column' gap='1' className='flex-1 min-w-[150px]'>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Incoming Amount
                  </Text>
                  {incomingPayment.incomingAmount ? (
                    <Text size='2' color='gray'>
                      {formatAmount(
                        incomingPayment.incomingAmount.value,
                        incomingPayment.incomingAmount.assetScale
                      )}{' '}
                      {incomingPayment.incomingAmount.assetCode}
                    </Text>
                  ) : (
                    <Text size='2' color='gray' className='italic'>
                      None
                    </Text>
                  )}
                </Flex>

                <Flex direction='column' gap='1' className='flex-1 min-w-[150px]'>
                  <Text size='2' weight='medium' className='text-gray-700'>
                    Received Amount
                  </Text>
                  <Text size='2' color='gray'>
                    {formatAmount(
                      incomingPayment.receivedAmount.value,
                      incomingPayment.receivedAmount.assetScale
                    )}{' '}
                    {incomingPayment.receivedAmount.assetCode}
                  </Text>
                </Flex>
              </Flex>

              <Flex direction='column' gap='1' className='w-full'>
                {incomingPayment.metadata ? (
                  <details>
                    <summary className='cursor-pointer font-medium text-sm text-gray-700'>
                      Metadata
                    </summary>
                    <pre
                      className='mt-1 text-sm'
                      dangerouslySetInnerHTML={{
                        __html: prettify(incomingPayment.metadata)
                      }}
                    />
                  </details>
                ) : (
                  <>
                    <Text size='2' weight='medium' className='text-gray-700'>
                      Metadata
                    </Text>
                    <Text size='2' color='gray' className='italic'>
                      None
                    </Text>
                  </>
                )}
              </Flex>
            </Flex>
          </Flex>
        </Card>

        <Card className='max-w-3xl'>
          <Flex direction='column' gap='4'>
            <Text className='rt-Text rt-r-size-2 rt-r-weight-medium uppercase tracking-wide text-gray-600 font-semibold'>
              Liquidity Information
            </Text>
            <Flex justify='between' align='center'>
              <Flex direction='column' gap='1'>
                <Text weight='medium'>Amount</Text>
                <Text size='2' color='gray'>
                  {displayLiquidityAmount}
                </Text>
              </Flex>
              <Flex gap='3'>
                {canWithdrawLiquidity ? (
                  <Button asChild>
                    <Link
                      aria-label='withdraw incoming payment liquidity page'
                      preventScrollReset
                      to={`/payments/incoming/${incomingPayment.id}/withdraw-liquidity`}
                    >
                      Withdraw liquidity
                    </Link>
                  </Button>
                ) : (
                  <Button
                    disabled={true}
                    aria-label='withdraw incoming payment liquidity page'
                  >
                    Withdraw liquidity
                  </Button>
                )}
              </Flex>
            </Flex>
          </Flex>
        </Card>
      </Flex>
      <Outlet context={displayLiquidityAmount} />
    </Box>
  )
}
