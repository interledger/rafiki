import { type ActionArgs } from '@remix-run/node'
import { useNavigate } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityDialog } from '~/components/LiquidityDialog'
import { withdrawIncomingPaymentLiquidity } from '~/lib/api/payments.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { amountSchema } from '~/lib/validate.server'

export default function IncomingPaymentWithdrawLiquidity() {
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })

  return (
    <LiquidityDialog
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
  const result = amountSchema.safeParse(formData.get('amount'))

  if (!result.success) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Amount is not valid. Please try again!',
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
