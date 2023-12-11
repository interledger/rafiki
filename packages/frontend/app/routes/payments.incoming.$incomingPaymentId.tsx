import type { LoaderArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Outlet, useLoaderData } from '@remix-run/react'
import { useState } from 'react'
import { z } from 'zod'
import { Badge, PageHeader } from '~/components'
import { Button } from '~/components/ui'
import { getIncomingPayment } from '~/lib/api/payments.server'
import { badgeColorByState, formatAmount } from '~/shared/utils'

export async function loader({ params }: LoaderArgs) {
  const incomingPaymentId = params.incomingPaymentId

  const result = z.string().uuid().safeParse(incomingPaymentId)
  if (!result.success) {
    throw json(null, {
      status: 400,
      statusText: 'Invalid incoming payment ID.'
    })
  }

  const incomingPayment = await getIncomingPayment({ id: result.data })

  if (!incomingPayment) {
    throw json(null, { status: 400, statusText: 'Incoming payment not found.' })
  }

  return json({
    incomingPayment: {
      ...incomingPayment,
      createdAt: new Date(incomingPayment.createdAt).toLocaleString(),
      expiresAt: new Date(incomingPayment.expiresAt).toLocaleString()
    }
  })
}

export default function ViewIncomingPaymentPage() {
  const { incomingPayment } = useLoaderData<typeof loader>()
  const [showMetadata, setShowMetadata] = useState(false)

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
              Created at {incomingPayment.createdAt}{' '}
              <Badge color={badgeColorByState[incomingPayment.state]}>
                {incomingPayment.state}
              </Badge>
            </p>
            {new Date(incomingPayment.expiresAt) > new Date() && (
              <p className='text-sm mb-2'>
                Expires at {incomingPayment.expiresAt}{' '}
              </p>
            )}
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 space-y-3'>
              <div>
                <p className='font-medium'>Incoming Payment ID</p>
                <p className='mt-1'>{incomingPayment.id}</p>
              </div>
              <div>
                <p className='font-medium'>
                  Wallet Address ID{' '}
                  <Button
                    className='mt-1 ml-1'
                    aria-label='go to wallet address page'
                    type='button'
                    size='xs'
                    to={`/wallet-addresses/${incomingPayment.walletAddressId}`}
                  >
                    ↗️
                  </Button>
                </p>
                <p className='mt-1'>{incomingPayment.walletAddressId}</p>
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
                    <em>None</em>
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
                  <>
                    <button
                      className='font-medium mb-1 cursor-pointer'
                      aria-label='toggle metadata visibility'
                      onClick={() => setShowMetadata(!showMetadata)}
                    >
                      {showMetadata ? '▼' : '►'} Metadata
                    </button>
                    {showMetadata && incomingPayment.metadata && (
                      <pre className='mt-1 text-sm break-words whitespace-pre-wrap'>
                        {JSON.stringify(incomingPayment.metadata, null, 2)}
                      </pre>
                    )}
                  </>
                ) : (
                  <>
                    <p className='font-medium'>Metadata</p>
                    <p className='mt-1'>
                      <em>None</em>
                    </p>
                  </>
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
                <p className='mt-1'>
                  {formatAmount(
                    incomingPayment.liquidity ?? '0',
                    incomingPayment.receivedAmount.assetScale
                  )}{' '}
                  {incomingPayment.receivedAmount.assetCode}
                </p>
              </div>
              <div className='flex space-x-4'>
                {BigInt(incomingPayment.liquidity ?? '0') ? (
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
      <Outlet />
    </div>
  )
}
