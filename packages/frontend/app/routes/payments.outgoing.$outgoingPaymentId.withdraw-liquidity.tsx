import { type ActionFunctionArgs } from '@remix-run/node'
import { useNavigate, useOutletContext } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityConfirmDialog } from '~/components/LiquidityConfirmDialog'
import { withdrawOutgoingPaymentLiquidity } from '~/lib/api/payments.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import type { LiquidityActionOutletContext } from './payments.outgoing.$outgoingPaymentId'

export default function OutgoingPaymentWithdrawLiquidity() {
  const { withdrawLiquidityDisplayAmount } =
    useOutletContext<LiquidityActionOutletContext>()[0]
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })

  return (
    <LiquidityConfirmDialog
      onClose={dismissDialog}
      title='Withdraw liquidity'
      type='Withdraw'
      displayAmount={withdrawLiquidityDisplayAmount}
    />
  )
}

export async function action({ request, params }: ActionFunctionArgs) {
  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const outgoingPaymentId = params.outgoingPaymentId

  if (!outgoingPaymentId) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Missing outgoing payment ID',
        type: 'error'
      },
      location: '.'
    })
  }

  const response = await withdrawOutgoingPaymentLiquidity({
    outgoingPaymentId,
    idempotencyKey: v4()
  })

  if (!response?.success) {
    return setMessageAndRedirect({
      session,
      message: {
        content:
          response?.message ??
          'Could not withdraw outgoing payment liquidity. Please try again!',
        type: 'error'
      },
      location: '.'
    })
  }

  return setMessageAndRedirect({
    session,
    message: {
      content: response.message,
      type: 'success'
    },
    location: '..'
  })
}
