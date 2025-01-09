import { json, type ActionFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityDialog } from '~/components/LiquidityDialog'
import { depositAssetLiquidity, getAssetInfo } from '~/lib/api/asset.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { amountSchema } from '~/lib/validate.server'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import { z } from 'zod'

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const assetId = params.assetId

  const result = z.string().uuid().safeParse(assetId)
  if (!result.success) {
    throw json(null, { status: 400, statusText: 'Invalid asset ID.' })
  }

  const asset = await getAssetInfo(request, { id: result.data })

  if (!asset) {
    throw json(null, { status: 404, statusText: 'Asset not found.' })
  }

  return json({ asset })
}

export default function AssetDepositLiquidity() {
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })
  const { asset } = useLoaderData<typeof loader>()

  return (
    <LiquidityDialog
      onClose={dismissDialog}
      title='Deposit asset liquidity'
      type='Deposit'
      asset={{ code: asset.code, scale: asset.scale }}
    />
  )
}

export async function action({ request, params }: ActionFunctionArgs) {
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

  const response = await depositAssetLiquidity(request, {
    assetId,
    amount: result.data,
    id: v4(),
    idempotencyKey: v4()
  })

  if (!response?.success) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Could not deposit asset liquidity. Please try again!',
        type: 'error'
      },
      location: '.'
    })
  }

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Deposited asset liquidity.',
      type: 'success'
    },
    location: '..'
  })
}
