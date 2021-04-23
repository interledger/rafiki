import {
  PeerNotFoundError,
  AccountNotFoundError
} from '@interledger/rafiki-core'
import { AccountingSystemContext } from '../index'

export async function create ({
  services: { accounts },
  request: { params, body },
  response
}: AccountingSystemContext): Promise<void> {
  const peerId = params.peerId
  const amount = -BigInt(body.amount)
  const scale = +body.scale

  try {
    const account = await accounts.get(peerId)
    const scaleDiff = account.assetScale - scale

    // TODO: update to check whether scaledAmountDiff is an integer
    if (scaleDiff < 0) {
      // TODO: should probably throw an error
      // logger.warn('Could not adjust balance due to scale differences', { amountDiff, scale })
      return
    }

    const scaleRatio = Math.pow(10, scaleDiff)
    const scaledAmountDiff = amount * BigInt(scaleRatio)

    await accounts.adjustBalanceReceivable(
      scaledAmountDiff,
      account.id,
      async ({ commit }) => {
        await commit()
      }
    )
    response.status = 200
  } catch (error) {
    if (
      error instanceof PeerNotFoundError ||
      error instanceof AccountNotFoundError
    ) {
      response.status = 404
      response.message = error.message
      return
    }
    throw error
  }
}
