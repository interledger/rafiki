import type { ActionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import {
  handleOutgoingPaymentCreated,
  handleOutgoingPaymentCompletedFailed,
  handleIncomingPaymentCompletedExpired,
  EventType,
  WebHook
} from '~/lib/webhooks.server'

export function parseError(e: unknown): string {
  return e instanceof Error && e.stack ? e.stack : String(e)
}

export async function action({ request }: ActionArgs) {
  const wh: WebHook = await request.json()
  console.log('received webhook: ', JSON.stringify(wh))

  try {
    switch (wh.type) {
      case EventType.OutgoingPaymentCreated:
        handleOutgoingPaymentCreated(wh)
        break
      case EventType.OutgoingPaymentCompleted:
      case EventType.OutgoingPaymentFailed:
        handleOutgoingPaymentCompletedFailed(wh)
        break
      case EventType.IncomingPaymentCompleted:
      case EventType.IncomingPaymentExpired:
        handleIncomingPaymentCompletedExpired(wh)
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
