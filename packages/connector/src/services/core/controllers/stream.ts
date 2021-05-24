import * as assert from 'assert'
import { StreamServer } from '@interledger/stream-receiver'
import { isIlpReply } from 'ilp-packet'
import { RafikiContext, RafikiMiddleware } from '../rafiki'

interface StreamControllerOptions {
  serverSecret: Buffer
  serverAddress: string
}

export function createStreamController({
  serverSecret,
  serverAddress
}: StreamControllerOptions): RafikiMiddleware {
  assert.equal(serverSecret.length, 32)
  const server = new StreamServer({ serverSecret, serverAddress })

  return async function (
    ctx: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> {
    const { request, response } = ctx

    const { stream } = ctx.accounts.outgoing
    if (!stream || !stream.enabled) {
      await next()
      return
    }

    // If `stream.enabled` but the destination isn't based on `serverAddress`,
    // `createReply` will return an F02:Unreachable.
    const moneyOrReply = server.createReply(request.prepare)
    response.reply = isIlpReply(moneyOrReply)
      ? moneyOrReply
      : moneyOrReply.accept()
  }
}
