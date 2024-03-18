import { type ActionFunctionArgs } from '@remix-run/node'
import { useNavigate, useOutletContext } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityConfirmDialog } from '~/components/LiquidityConfirmDialog'
import { depositOutgoingPaymentLiquidity } from '~/lib/api/payments.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { authStorage, getApiToken } from '~/lib/auth.server'
import type { LiquidityActionOutletContext } from './payments.outgoing.$outgoingPaymentId'

export default function OutgoingPaymentDepositLiquidity() {
  const { depositLiquidityDisplayAmount } =
    useOutletContext<LiquidityActionOutletContext>()[0]
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })

  return (
    <LiquidityConfirmDialog
      onClose={dismissDialog}
      title='Deposit outgoing payment liquidity'
      type='Deposit'
      displayAmount={depositLiquidityDisplayAmount}
    />
  )
}

export async function action({ request, params }: ActionFunctionArgs) {
  const messageSession = await messageStorage.getSession(
    request.headers.get('cookie')
  )
  const outgoingPaymentId = params.outgoingPaymentId

  if (!outgoingPaymentId) {
    return setMessageAndRedirect({
      session: messageSession,
      message: {
        content: 'Missing outgoing payment ID',
        type: 'error'
      },
      location: '.'
    })
  }

  const authSession = await authStorage.getSession(
    request.headers.get('cookie')
  )
  const apiToken = getApiToken(authSession) as string

  const response = await depositOutgoingPaymentLiquidity(
    {
      outgoingPaymentId,
      idempotencyKey: v4()
    },
    apiToken
  )

  if (!response?.success) {
    return setMessageAndRedirect({
      session: messageSession,
      message: {
        content:
          response?.message ??
          'Could not deposit outgoing payment liquidity. Please try again!',
        type: 'error'
      },
      location: '.'
    })
  }

  return setMessageAndRedirect({
    session: messageSession,
    message: {
      content: response.message,
      type: 'success'
    },
    location: '..'
  })
}
