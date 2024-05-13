import { type ActionFunctionArgs, json } from '@remix-run/node'
import { useNavigate, useOutletContext, useActionData } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityWithdrawalConfirmDialog } from '~/components/LiquidityWithdrawalConfirmDialog'
import { createWalletAddressWithdrawal } from '~/lib/api/wallet-address.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { redirectIfUnauthorizedAccess } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import type { ZodFieldErrors } from '~/shared/types'
import { withdrawLiquidityConfirmationSchema } from '~/lib/validate.server'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await redirectIfUnauthorizedAccess(request.url, cookies)
  return null
}

export default function WalletAddressWithdrawLiquidity() {
  const response = useActionData<typeof action>()
  const displayLiquidityAmount = useOutletContext<string>()
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })

  return (
    <LiquidityWithdrawalConfirmDialog
      onClose={dismissDialog}
      title='Withdraw liquidity'
      displayAmount={displayLiquidityAmount}
      errors={response?.errors}
    />
  )
}

export async function action({ request, params }: ActionFunctionArgs) {
  const errors: {
    fieldErrors: ZodFieldErrors<typeof withdrawLiquidityConfirmationSchema>
  } = {
    fieldErrors: {}
  }

  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const walletAddressId = params.walletAddressId

  if (!walletAddressId) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Missing wallet address ID',
        type: 'error'
      },
      location: '.'
    })
  }

  const formData = await request.formData()
  const result = withdrawLiquidityConfirmationSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) {
    errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ errors }, { status: 400 })
  }

  let timeout = 0
  if (result.data.transferType === 'two-phase') {
    if (!result.data.timeout) {
      throw json(null, { status: 400, statusText: 'Unable to extract timeout value.' })
    }
    timeout = result.data.timeout
  }

  const response = await createWalletAddressWithdrawal({
    id: v4(),
    walletAddressId,
    idempotencyKey: v4(),
    timeoutSeconds: BigInt(timeout)
  })

  if (!response?.success) {
    return setMessageAndRedirect({
      session,
      message: {
        content:
          response?.message ??
          'Could not withdraw wallet address liquidity. Please try again!',
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
