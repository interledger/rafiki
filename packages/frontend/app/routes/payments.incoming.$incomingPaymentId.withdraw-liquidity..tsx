import { type ActionArgs } from '@remix-run/node'
import { useNavigate } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityConfirmDialog } from '~/components/LiquidityConfirmDialog'
import { withdrawIncomingPaymentLiquidity } from '~/lib/api/payments.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { confirmedSchema } from '~/lib/validate.server'

export default function IncomingPaymentWithdrawLiquidity() {
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })

  return (
    <LiquidityConfirmDialog
      onClose={dismissDialog}
      title='Withdraw incoming payment liquidity'
      type='Withdraw'
    />
  )
}

export async function action({ request, params }: ActionArgs) {
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

  const formData = await request.formData()
  const result = confirmedSchema.safeParse(formData.get('confirmed'))

  if (!result.success) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Something went wrong. Please try again!',
        type: 'error'
      },
      location: '.'
    })
  }

  const response = await withdrawIncomingPaymentLiquidity({
    incomingPaymentId,
    idempotencyKey: v4()
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
