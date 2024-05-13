import { type ActionFunctionArgs, json } from '@remix-run/node'
import { useNavigate, useActionData } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityWithdrawalDialog } from '~/components/LiquidityWithdrawalDialog'
import { withdrawAssetLiquidity } from '~/lib/api/asset.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { withdrawLiquiditySchema } from '~/lib/validate.server'
import { redirectIfUnauthorizedAccess } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import type { ZodFieldErrors } from '~/shared/types'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await redirectIfUnauthorizedAccess(request.url, cookies)
  return null
}

export default function AssetWithdrawLiquidity() {
  const response = useActionData<typeof action>()
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })

  return (
    <LiquidityWithdrawalDialog
      onClose={dismissDialog}
      title='Withdraw asset liquidity'
      errors={response?.errors}
    />
  )
}

export async function action({ request, params }: ActionFunctionArgs) {
  const errors: {
    fieldErrors: ZodFieldErrors<typeof withdrawLiquiditySchema>
  } = {
    fieldErrors: {}
  }
  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const assetId = params.assetId

  if (!assetId) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Missing asset ID',
        type: 'error'
      },
      location: '.'
    })
  }

  const formData = await request.formData()
  const result = withdrawLiquiditySchema.safeParse(Object.fromEntries(formData))
  if (!result.success) {
    errors.fieldErrors = result.error.flatten().fieldErrors
    return json({ errors }, { status: 400 })
  }

  let timeout = 0
  if (result.data.transferType === 'two-phase') {
    timeout = result.data.timeout! // TODO: consider better error handling?
  }

  const response = await withdrawAssetLiquidity({
    assetId,
    amount: result.data.amount,
    id: v4(),
    idempotencyKey: v4(),
    timeoutSeconds: BigInt(timeout)
  })

  if (!response?.success) {
    return setMessageAndRedirect({
      session,
      message: {
        content:
          response?.message ??
          'Could not withdraw asset liquidity. Please try again!',
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
