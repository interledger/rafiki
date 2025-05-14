import type { ActionFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
  handleConfirmPacket,
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

export function parseError(e: unknown): string {
  return e instanceof Error && e.stack ? e.stack : String(e)
}

export async function action({ request }: ActionFunctionArgs) {
  const wh: Webhook = await request.json()
  console.log('received webhook: ', JSON.stringify(wh))

  try {
    switch (wh.type) {
      case 'prepare_packet.received' as WebhookEventType:
        await handleConfirmPacket(wh)
        break
      case WebhookEventType.OutgoingPaymentCreated:
        await handleOutgoingPaymentCreated(wh)
        break
      case WebhookEventType.OutgoingPaymentCompleted:
      case WebhookEventType.OutgoingPaymentFailed:
        await handleOutgoingPaymentCompletedFailed(wh)
        break
      case WebhookEventType.IncomingPaymentCreated:
        break
      case WebhookEventType.IncomingPaymentCompleted:
      case WebhookEventType.IncomingPaymentExpired:
        // await handleIncomingPaymentCompletedExpired(wh)
        break
      case WebhookEventType.WalletAddressWebMonetization:
        await handleWalletAddressWebMonetization(wh)
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
