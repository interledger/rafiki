import { type ActionArgs } from '@remix-run/node'
import { useNavigate } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityDialog } from '~/components/LiquidityDialog'
import { addPeerLiquidity } from '~/lib/api/peer.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { amountSchema } from '~/lib/validate.server'

export default function PeerDepositLiquidity() {
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })

  return (
    <LiquidityDialog
      onClose={dismissDialog}
      title='Deposit peer liquidity'
      type='Deposit'
    />
  )
}

export async function action({ request, params }: ActionArgs) {
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

  const response = await addPeerLiquidity({
    peerId,
    amount: result.data,
    id: v4(),
    idempotencyKey: v4()
  })

  if (!response?.success) {
    return setMessageAndRedirect({
      session,
      message: {
        content:
          response?.message ??
          'Could not deposit peer liquidity. Please try again!',
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
