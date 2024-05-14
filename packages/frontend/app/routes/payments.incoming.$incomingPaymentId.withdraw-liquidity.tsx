import { type ActionFunctionArgs } from '@remix-run/node'
import { useNavigate, useOutletContext } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityConfirmDialog } from '~/components/LiquidityConfirmDialog'
import { createIncomingPaymentWithdrawal } from '~/lib/api/payments.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { redirectIfUnauthorizedAccess } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import { timeoutTwoPhase } from '~/utils/config.server'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await redirectIfUnauthorizedAccess(request.url, cookies)
  return null
}

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
  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const incomingPaymentId = params.incomingPaymentId

  if (!incomingPaymentId) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Missing incoming payment ID',
        type: 'error'
      },
      location: '.'
    })
  }

  const response = await createIncomingPaymentWithdrawal({
    incomingPaymentId,
    idempotencyKey: v4(),
    timeoutSeconds: timeoutTwoPhase
  })

  if (!response?.success) {
    return setMessageAndRedirect({
      session,
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
    session,
    message: {
      content: response.message,
      type: 'success'
    },
    location: '..'
  })
}
