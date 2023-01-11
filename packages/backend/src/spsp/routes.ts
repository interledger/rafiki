import { BaseService } from '../shared/baseService'
import { PaymentPointerContext } from '../app'
import base64url from 'base64url'
import { StreamServer } from '@interledger/stream-receiver'

const CONTENT_TYPE_V4 = 'application/spsp4+json'

export interface SPSPRoutes {
  get(ctx: PaymentPointerContext): Promise<void>
}

interface ServiceDependencies extends Omit<BaseService, 'knex'> {
  streamServer: StreamServer
}

export async function createSPSPRoutes({
  logger,
  streamServer
}: ServiceDependencies): Promise<SPSPRoutes> {
  const log = logger.child({
    service: 'SPSP Routes'
  })

  const deps: ServiceDependencies = {
    logger: log,
    streamServer
  }
  return {
    get: (ctx) => getPay(deps, ctx)
  }
}

async function getPay(
  deps: ServiceDependencies,
  ctx: PaymentPointerContext
): Promise<void> {
  ctx.assert(ctx.accepts(CONTENT_TYPE_V4), 406)

  const nonce = ctx.request.headers['receipt-nonce']
  const secret = ctx.request.headers['receipt-secret']
  ctx.assert(
    !nonce === !secret,
    400,
    'Failed to generate credentials: receipt nonce and secret must accompany each other'
  )

  try {
    const { ilpAddress, sharedSecret } = deps.streamServer.generateCredentials({
      paymentTag: ctx.paymentPointer.id,
      receiptSetup:
        nonce && secret
          ? {
              nonce: Buffer.from(nonce.toString(), 'base64'),
              secret: Buffer.from(secret.toString(), 'base64')
            }
          : undefined,
      asset: {
        code: ctx.paymentPointer.asset.code,
        scale: ctx.paymentPointer.asset.scale
      }
    })

    ctx.set('Content-Type', CONTENT_TYPE_V4)
    ctx.body = JSON.stringify({
      destination_account: ilpAddress,
      shared_secret: base64url(sharedSecret),
      receipts_enabled: !!(nonce && secret)
    })
  } catch (err) {
    ctx.throw(400, err && err['message'])
  }
}
