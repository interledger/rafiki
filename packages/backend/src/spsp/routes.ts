import { BaseService } from '../shared/baseService'
import { AppContext } from '../app'
import { validateId } from '../shared/utils'
import base64url from 'base64url'
import { StreamServer } from '@interledger/stream-receiver'
import { WebMonetizationService } from '../webmonetization/service'
import { PaymentPointerService } from '../payment_pointer/service'

const CONTENT_TYPE_V4 = 'application/spsp4+json'

export interface SPSPRoutes {
  get(ctx: AppContext): Promise<void>
}

interface ServiceDependencies extends Omit<BaseService, 'knex'> {
  paymentPointerService: PaymentPointerService
  wmService: WebMonetizationService
  streamServer: StreamServer
}

export async function createSPSPRoutes({
  logger,
  paymentPointerService,
  wmService,
  streamServer
}: ServiceDependencies): Promise<SPSPRoutes> {
  const log = logger.child({
    service: 'SPSP Routes'
  })

  const deps: ServiceDependencies = {
    logger: log,
    paymentPointerService,
    wmService,
    streamServer
  }
  return {
    get: (ctx) => getPay(deps, ctx)
  }
}

async function getPay(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { paymentPointerId } = ctx.params

  ctx.assert(
    validateId(paymentPointerId),
    400,
    'Failed to generate credentials: invalid payment pointer id'
  )
  ctx.assert(ctx.accepts(CONTENT_TYPE_V4), 406)

  const nonce = ctx.request.headers['receipt-nonce']
  const secret = ctx.request.headers['receipt-secret']
  ctx.assert(
    !nonce === !secret,
    400,
    'Failed to generate credentials: receipt nonce and secret must accompany each other'
  )

  const paymentPointer = await deps.paymentPointerService.get(paymentPointerId)
  if (!paymentPointer) {
    ctx.status = 404
    ctx.set('Content-Type', CONTENT_TYPE_V4)
    ctx.body = JSON.stringify({
      id: 'InvalidReceiverError',
      message: 'Invalid receiver ID'
    })
    return
  }

  try {
    const invoice = await deps.wmService.getInvoice(paymentPointerId)
    const { ilpAddress, sharedSecret } = deps.streamServer.generateCredentials({
      paymentTag: invoice.id,
      receiptSetup:
        nonce && secret
          ? {
              nonce: Buffer.from(nonce.toString(), 'base64'),
              secret: Buffer.from(secret.toString(), 'base64')
            }
          : undefined,
      asset: {
        code: paymentPointer.asset.code,
        scale: paymentPointer.asset.scale
      }
    })

    ctx.set('Content-Type', CONTENT_TYPE_V4)
    ctx.body = JSON.stringify({
      destination_account: ilpAddress,
      shared_secret: base64url(sharedSecret),
      receipts_enabled: !!(nonce && secret)
    })
  } catch (err) {
    ctx.throw(400, err.message)
  }
}
