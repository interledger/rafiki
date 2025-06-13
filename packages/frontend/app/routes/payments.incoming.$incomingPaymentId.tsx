import type { LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, Outlet, useLoaderData } from '@remix-run/react'
import { z } from 'zod'
import { Badge, PageHeader } from '~/components'
import { Button } from '~/components/ui'
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
  )} 
  ${incomingPayment.receivedAmount.assetCode}`

  const expiresAtLocale = new Date(incomingPayment.expiresAt).toLocaleString()

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        {/* Incoming Payment General Info */}
        <PageHeader className='!justify-end'>
          <Button aria-label='go back to payments page' to='/payments'>
            Go to payments page
          </Button>
        </PageHeader>
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          {/* Incoming Payment General Info*/}
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>General Information</h3>
            <p className='text-sm'>
              Created at {new Date(incomingPayment.createdAt).toLocaleString()}{' '}
            </p>
            {new Date(expiresAtLocale) > new Date() && (
              <p className='text-sm mb-2'>Expires at {expiresAtLocale} </p>
            )}
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 space-y-3'>
              <div>
                <p className='font-medium'>Incoming Payment ID</p>
                <p className='mt-1'>{incomingPayment.id}</p>
              </div>
              <div>
                <p className='font-medium'>Wallet Address ID </p>
                <Link
                  to={`/wallet-addresses/${incomingPayment.walletAddressId}`}
                  className='default-link'
                >
                  {incomingPayment.walletAddressId}
                </Link>
              </div>
              <div>
                <p className='font-medium'>State</p>
                <Badge color={badgeColorByPaymentState[incomingPayment.state]}>
                  {incomingPayment.state}
                </Badge>
              </div>
              <div>
                <p className='font-medium'>Incoming Amount</p>
                <p className='mt-1'>
                  {incomingPayment.incomingAmount ? (
                    formatAmount(
                      incomingPayment.incomingAmount.value,
                      incomingPayment.incomingAmount.assetScale
                    ) +
                    ' ' +
                    incomingPayment.incomingAmount.assetCode
                  ) : (
                    <i>None</i>
                  )}
                </p>
              </div>
              <div>
                <p className='font-medium'>Received Amount</p>
                <p className='mt-1'>
                  {formatAmount(
                    incomingPayment.receivedAmount.value,
                    incomingPayment.receivedAmount.assetScale
                  ) +
                    ' ' +
                    incomingPayment.receivedAmount.assetCode}
                </p>
              </div>
              <div>
                {incomingPayment.metadata ? (
                  <details>
                    <summary>Metadata</summary>
                    <pre
                      className='mt-1 text-sm'
                      dangerouslySetInnerHTML={{
                        __html: prettify(incomingPayment.metadata)
                      }}
                    />
                  </details>
                ) : (
                  <div>
                    <p className='font-medium'>Metadata</p>
                    <p className='mt-1'>
                      <i>None</i>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Incoming Payment General Info - END */}
        {/* Incoming Payment Liquidity */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Liquidity Information</h3>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 flex justify-between items-center'>
              <div>
                <p className='font-medium'>Amount</p>
                <p className='mt-1'>{displayLiquidityAmount}</p>
              </div>
              <div className='flex space-x-4'>
                {canWithdrawLiquidity ? (
                  <Button
                    aria-label='withdraw incoming payment liquidity page'
                    preventScrollReset
                    to={`/payments/incoming/${incomingPayment.id}/withdraw-liquidity`}
                  >
                    Withdraw
                  </Button>
                ) : (
                  <Button
                    disabled={true}
                    aria-label='withdraw incoming payment liquidity page'
                  >
                    Withdraw
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Incoming Payment Liquidity - END */}
      </div>
      <Outlet context={displayLiquidityAmount} />
    </div>
  )
}
