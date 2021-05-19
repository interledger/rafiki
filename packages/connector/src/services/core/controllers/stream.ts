import * as assert from 'assert'
import { StreamServer } from '@interledger/stream-receiver'
import { isIlpReply, serializeIlpReply } from 'ilp-packet'
import { RafikiContext } from '../rafiki'

interface StreamControllerOptions {
  serverSecret: Buffer
  serverAddress: string
}

// If the packet pays into an Open Payments invoice per the encoded paymentTag, the operator should credit that invoice with the delivered amount into its stateful balance system. If the packet is fulfilled, the STREAM server will inform the sender that the amount field of the ILP Prepare was the amount delivered to the recipient, which they will use for their own accounting.

export function createStreamController({ serverSecret, serverAddress }: StreamControllerOptions) {
  assert.equal(serverSecret.length, 32)
  const server = new StreamServer({ serverSecret, serverAddress })

  return async function(ctx: RafikiContext, next: () => Promise<unknown>): Promise<void> {
    const {
      //services: { accounts },
      request,
      response
    } = ctx

    const { stream } = ctx.accounts.outgoing
    if (!stream || !stream.enabled) {
      await next()
      return
    }

    // If `stream.enabled` but the destination isn't based on `serverAddress`,
    // `createReply` will return an F02:Unreachable.
    const moneyOrReply = server.createReply(request.prepare)
    response.reply = isIlpReply(moneyOrReply) ? moneyOrReply : moneyOrReply.accept()
  }
}
