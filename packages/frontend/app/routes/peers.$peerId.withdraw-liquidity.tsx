import { type ActionFunctionArgs } from '@remix-run/node'
import { useNavigate } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityDialog } from '~/components/LiquidityDialog'
import { withdrawPeerLiquidity } from '~/lib/api/peer.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { amountSchema } from '~/lib/validate.server'
import { redirectIfUnauthorizedAccess } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await redirectIfUnauthorizedAccess(request.url, cookies)
  return null
}

export default function PeerWithdrawLiquidity() {
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })

  return (
    <LiquidityDialog
      onClose={dismissDialog}
      title='Withdraw peer liquidity'
      type='Withdraw'
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

  const response = await withdrawPeerLiquidity({
    peerId,
    amount: result.data,
    id: v4(),
    idempotencyKey: v4(),
    timeoutSeconds: BigInt(0)
  })

  if (!response?.success) {
    return setMessageAndRedirect({
      session,
      message: {
        content: 'Could not withdraw peer liquidity. Please try again!',
        type: 'error'
      },
      location: '.'
    })
  }

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Withdrew peer liquidity',
      type: 'success'
    },
    location: '..'
  })
}
