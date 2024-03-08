import { type ActionFunctionArgs } from '@remix-run/node'
import { useNavigate, useOutletContext } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityConfirmDialog } from '~/components/LiquidityConfirmDialog'
import { createWalletAddressWithdrawal } from '~/lib/api/wallet-address.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'

export default function WalletAddressWithdrawLiquidity() {
  const displayLiquidityAmount = useOutletContext<string>()
  const navigate = useNavigate()
  const dismissDialog = () => navigate('..', { preventScrollReset: true })

  return (
    <LiquidityConfirmDialog
      onClose={dismissDialog}
      title='Withdraw liquidity'
      type='Withdraw'
      displayAmount={displayLiquidityAmount}
    />
  )
}

export async function action({ request, params }: ActionFunctionArgs) {
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

  const response = await createWalletAddressWithdrawal({
    id: v4(),
    walletAddressId,
    idempotencyKey: v4()
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
