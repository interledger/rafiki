import type { LoaderArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, Outlet, useLoaderData } from '@remix-run/react'
import { useState } from 'react'
import { z } from 'zod'
import { PageHeader } from '~/components'
import { Button } from '~/components/ui'
import { getOutgoingPayment } from '~/lib/api/payments.server'
import { formatAmount } from '~/shared/utils'

export async function loader({ params }: LoaderArgs) {
  const outgoingPaymentId = params.outgoingPaymentId

  const result = z.string().uuid().safeParse(outgoingPaymentId)
  if (!result.success) {
    throw json(null, {
      status: 400,
      statusText: 'Invalid outgoing payment ID.'
    })
  }

  const outgoingPayment = await getOutgoingPayment({ id: result.data })

  if (!outgoingPayment) {
    throw json(null, { status: 400, statusText: 'Outgoing payment not found.' })
  }

  return json({
    outgoingPayment: {
      ...outgoingPayment,
      createdAt: new Date(outgoingPayment.createdAt).toLocaleString()
    }
  })
}

export default function ViewOutgoingPaymentPage() {
  const { outgoingPayment } = useLoaderData<typeof loader>()
  const [showMetadata, setShowMetadata] = useState(false)

  return (
    <div className='pt-4 flex flex-col space-y-4'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        {/* Outgoing Payment General Info */}
        <PageHeader className='!justify-end'>
          <Button aria-label='go back to payments page' to='/payments'>
            Go to payments page
          </Button>
        </PageHeader>
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          {/* Outgoing Payment General Info*/}
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>General Information</h3>
            <p className='text-sm'>Created at {outgoingPayment.createdAt}</p>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 gap-4 grid grid-cols-1 lg:grid-cols-3'>
              <div>
                <p className='font-medium'>Outgoing Payment ID</p>
                <p className='mt-1'>{outgoingPayment.id}</p>
              </div>
              <div>
                <p className='font-medium'>
                  Wallet Address ID{' '}
                  <Button
                    className='mt-1 ml-1'
                    aria-label='go to wallet address page'
                    type='button'
                    size='xs'
                    to={`/wallet-addresses/${outgoingPayment.walletAddressId}`}
                  >
                    ↗️
                  </Button>
                </p>
                <p className='mt-1'>{outgoingPayment.walletAddressId}</p>
              </div>
              <div>
                <p className='font-medium'>Receiver</p>
                <Link
                  className='underline text-blue-600 hover:text-blue-800 visited:text-purple-600'
                  to={outgoingPayment.receiver}
                >
                  {outgoingPayment.receiver}
                </Link>
              </div>
              <div>
                <p className='font-medium'>State</p>
                <p className='mt-1'>{outgoingPayment.state}</p>
              </div>
              <div>
                <p className='font-medium'>State Attempts</p>
                <p className='mt-1'>{outgoingPayment.stateAttempts}</p>
              </div>
              <div>
                <p className='font-medium'>Error</p>
                {outgoingPayment.error ? (
                  <p className='mt-1 text-red-500'>{outgoingPayment.error}</p>
                ) : (
                  <em>None</em>
                )}
              </div>
              <div>
                {outgoingPayment.metadata ? (
                  <>
                    <button
                      className='font-medium mb-1 cursor-pointer'
                      aria-label='toggle metadata visibility'
                      onClick={() => setShowMetadata(!showMetadata)}
                    >
                      {showMetadata ? '▼' : '►'} Metadata
                    </button>
                    {showMetadata && outgoingPayment.metadata && (
                      <pre className='mt-1'>
                        {JSON.stringify(outgoingPayment.metadata, null, 2)}
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
        {/* Outgoing Payment General Info - END */}

        {/* Outgoing Payment Receive Amount */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Receive Amount</h3>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 gap-4 grid grid-cols-1 lg:grid-cols-3'>
              <div>
                <p className='font-medium'>Amount</p>
                <p className='mt-1'>
                  {formatAmount(
                    outgoingPayment.receiveAmount.value,
                    outgoingPayment.receiveAmount.assetScale
                  )}
                </p>
              </div>
              <div>
                <p className='font-medium'>Asset Code</p>
                <p className='mt-1'>
                  {outgoingPayment.receiveAmount.assetCode}
                </p>
              </div>
            </div>
          </div>
        </div>
        {/* Outgoing Payment Outgoing Amount - END */}

        {/* Outgoing Payment Debit Amount */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Debit Amount</h3>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 gap-4 grid grid-cols-1 lg:grid-cols-3'>
              <div>
                <p className='font-medium'>Amount</p>
                <p className='mt-1'>
                  {formatAmount(
                    outgoingPayment.debitAmount.value,
                    outgoingPayment.debitAmount.assetScale
                  )}
                </p>
              </div>
              <div>
                <p className='font-medium'>Asset Code</p>
                <p className='mt-1'>{outgoingPayment.debitAmount.assetCode}</p>
              </div>
            </div>
          </div>
        </div>
        {/* Outgoing Payment Debit Amount - END */}

        {/* Outgoing Payment Sent Amount */}
        <div className='grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl'>
          <div className='col-span-1 pt-3'>
            <h3 className='text-lg font-medium'>Sent Amount</h3>
          </div>
          <div className='md:col-span-2 bg-white rounded-md shadow-md'>
            <div className='w-full p-4 gap-4 grid grid-cols-1 lg:grid-cols-3'>
              <div>
                <p className='font-medium'>Amount</p>
                <p className='mt-1'>
                  {formatAmount(
                    outgoingPayment.sentAmount.value,
                    outgoingPayment.sentAmount.assetScale
                  )}
                </p>
              </div>
              <div>
                <p className='font-medium'>Asset Code</p>
                <p className='mt-1'>{outgoingPayment.sentAmount.assetCode}</p>
              </div>
            </div>
          </div>
        </div>
        {/* Outgoing Payment Sent Amount - END */}

        {/* Outgoing Payment Liquidity */}
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
                    outgoingPayment.liquidity ?? '0',
                    outgoingPayment.receiveAmount.assetScale
                  )}{' '}
                  {outgoingPayment.receiveAmount.assetCode}
                </p>
              </div>
              <div className='flex space-x-4'>
                <Button
                  aria-label='withdraw outgoing payment liquidity page'
                  preventScrollReset
                  type='button'
                  to={`/payments/outgoing/${outgoingPayment.id}/withdraw-liquidity`}
                >
                  Withdraw
                </Button>
                <Button
                  aria-label='deposit outgoing payment liquidity page'
                  preventScrollReset
                  type='button'
                  to={`/payments/outgoing/${outgoingPayment.id}/deposit-liquidity`}
                >
                  Deposit
                </Button>
              </div>
            </div>
          </div>
        </div>
        {/* Outgoing Payment Liquidity - END */}
      </div>
      <Outlet />
    </div>
  )
}
