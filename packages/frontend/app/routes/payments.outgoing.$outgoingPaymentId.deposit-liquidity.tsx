import { type ActionFunctionArgs } from '@remix-run/node'
import { useNavigate, useOutletContext } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityConfirmDialog } from '~/components/LiquidityConfirmDialog'
import { depositOutgoingPaymentLiquidity } from '~/lib/api/payments.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import type { LiquidityActionOutletContext } from './payments.outgoing.$outgoingPaymentId'
import { redirectIfUnauthorizedAccess } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await redirectIfUnauthorizedAccess(request.url, cookies)
  return null
}

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

  const response = await depositOutgoingPaymentLiquidity({
    outgoingPaymentId,
    idempotencyKey: v4()
  })

  if (!response?.id) {
    return setMessageAndRedirect({
      session,
      message: {
        content:
          'Could not deposit outgoing payment liquidity. Please try again!',
        type: 'error'
      },
      location: '.'
    })
  }

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Deposited outgoing payment liquidity.',
      type: 'success'
    },
    location: '..'
  })
}
