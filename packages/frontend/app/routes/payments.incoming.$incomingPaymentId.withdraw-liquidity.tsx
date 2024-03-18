import { type ActionFunctionArgs } from '@remix-run/node'
import { useNavigate, useOutletContext } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityConfirmDialog } from '~/components/LiquidityConfirmDialog'
import { withdrawIncomingPaymentLiquidity } from '~/lib/api/payments.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { authStorage, getApiToken } from '~/lib/auth.server'

export default function IncomingPaymentWithdrawLiquidity() {
  const displayLiquidityAmount = useOutletContext<string>()
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })

  return (
    <LiquidityConfirmDialog
      onClose={dismissDialog}
      title='Withdraw incoming payment liquidity'
      type='Withdraw'
      displayAmount={displayLiquidityAmount}
    />
  )
}

export async function action({ request, params }: ActionFunctionArgs) {
  const messageSession = await messageStorage.getSession(
    request.headers.get('cookie')
  )
  const incomingPaymentId = params.incomingPaymentId

  if (!incomingPaymentId) {
    return setMessageAndRedirect({
      session: messageSession,
      message: {
        content: 'Missing incoming payment ID',
        type: 'error'
      },
      location: '.'
    })
  }

  const authSession = await authStorage.getSession(
    request.headers.get('cookie')
  )
  const apiToken = getApiToken(authSession) as string

  const response = await withdrawIncomingPaymentLiquidity(
    {
      incomingPaymentId,
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
          'Could not withdraw incoming payment liquidity. Please try again!',
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
