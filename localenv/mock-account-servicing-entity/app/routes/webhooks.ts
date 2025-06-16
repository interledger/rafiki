import type { ActionFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
  handleLowLiquidity,
  handleWalletAddressNotFound,
  handleWalletAddressWebMonetization
} from '~/lib/webhooks.server'
import {
  handleOutgoingPaymentCreated,
  handleOutgoingPaymentCompletedFailed,
  handleIncomingPaymentCompletedExpired
} from '~/lib/webhooks.server'
import { WebhookEventType, Webhook } from 'mock-account-service-lib'
import { getTenantCredentials } from '~/lib/utils'
import { messageStorage } from '~/lib/message.server'

export function parseError(e: unknown): string {
  return e instanceof Error && e.stack ? e.stack : String(e)
}

export async function action({ request }: ActionFunctionArgs) {
  const wh: Webhook = await request.json()
  console.log('received webhook: ', JSON.stringify(wh))

  const session = await messageStorage.getSession()
  const tenantOptions = await getTenantCredentials(session)

  try {
    switch (wh.type) {
      case WebhookEventType.OutgoingPaymentCreated:
        await handleOutgoingPaymentCreated(wh, tenantOptions)
        break
      case WebhookEventType.OutgoingPaymentCompleted:
      case WebhookEventType.OutgoingPaymentFailed:
        await handleOutgoingPaymentCompletedFailed(wh)
        break
      case WebhookEventType.IncomingPaymentCreated:
        break
      case WebhookEventType.IncomingPaymentCompleted:
      case WebhookEventType.IncomingPaymentExpired:
        await handleIncomingPaymentCompletedExpired(wh, tenantOptions)
        break
      case WebhookEventType.WalletAddressWebMonetization:
        await handleWalletAddressWebMonetization(wh, tenantOptions)
        break
      case WebhookEventType.WalletAddressNotFound:
        await handleWalletAddressNotFound(wh)
        break
      case WebhookEventType.AssetLiquidityLow:
      case WebhookEventType.PeerLiquidityLow:
        await handleLowLiquidity(wh)
        break
      default:
        console.log(`unknown event type: ${wh.type}`)
        return json(undefined, { status: 400 })
    }
  } catch (e) {
    const errorInfo = parseError(e)
    console.log(errorInfo)
  }

  return json(undefined, { status: 200 })
}
