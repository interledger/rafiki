import { type ActionFunctionArgs } from '@remix-run/node'
import { useNavigate, useOutletContext } from '@remix-run/react'
import { v4 } from 'uuid'
import { LiquidityConfirmDialog } from '~/components/LiquidityConfirmDialog'
import { createWalletAddressWithdrawal } from '~/lib/api/wallet-address.server'
import { messageStorage, setMessageAndRedirect } from '~/lib/message.server'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'
import { type LoaderFunctionArgs } from '@remix-run/node'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)
  return null
}

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

  const response = await createWalletAddressWithdrawal(request, {
    id: v4(),
    walletAddressId,
    idempotencyKey: v4(),
    timeoutSeconds: BigInt(0)
  })

  if (!response?.withdrawal) {
    return setMessageAndRedirect({
      session,
      message: {
        content:
          'Could not withdraw wallet address liquidity. Please try again!',
        type: 'error'
      },
      location: '.'
    })
  }

  return setMessageAndRedirect({
    session,
    message: {
      content: 'Withdrew wallet address liquidity.',
      type: 'success'
    },
    location: '..'
  })
}
