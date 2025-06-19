import { json, type ActionFunctionArgs } from '@remix-run/node'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityDialog } from '~/components/LiquidityDialog'
import { depositPeerLiquidity, getPeer } from '~/lib/api/peer.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { amountSchema } from '~/lib/validate.server'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'
import { z } from 'zod'

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const peerId = params.peerId

  const result = z.string().uuid().safeParse(peerId)
  if (!result.success) {
    throw json(null, { status: 400, statusText: 'Invalid peer ID.' })
  }

  const peer = await getPeer(request, { id: result.data })

  if (!peer) {
    throw json(null, { status: 400, statusText: 'Peer not found.' })
  }

  return json({ asset: peer.asset })
}

export default function PeerDepositLiquidity() {
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })
  const { asset } = useLoaderData<typeof loader>()

  return (
    <LiquidityDialog
      onClose={dismissDialog}
      title='Deposit peer liquidity'
      type='Deposit'
      asset={{ code: asset.code, scale: asset.scale }}
    />
  )
}

export async function action({ request, params }: ActionFunctionArgs) {
  const session = await messageStorage.getSession(request.headers.get('cookie'))
  const peerId = params.peerId

  if (!peerId) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Missing peer ID',
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

  const response = await depositPeerLiquidity(request, {
    peerId,
    amount: result.data,
    id: v4(),
    idempotencyKey: v4()
  })

  if (!response?.success) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Could not deposit peer liquidity. Please try again!',
        type: 'error'
      },
      location: '.'
    })
  }

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Deposited peer liquidity.',
      type: 'success'
    },
    location: '..'
  })
}
