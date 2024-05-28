import { BaseService } from '../../../shared/baseService'
import { SPSPContext } from '../../../app'
import base64url from 'base64url'
import { StreamServer } from '@interledger/stream-receiver'
import { SPSPRouteError } from './middleware'

export const SPSP_CONTENT_TYPE_V4 = 'application/spsp4+json'

export interface SPSPRoutes {
  get(ctx: SPSPContext): Promise<void>
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
    get: (ctx) => getSPSP(deps, ctx)
  }
}

async function getSPSP(
  deps: ServiceDependencies,
  ctx: SPSPContext
): Promise<void> {
  if (!ctx.request.headers.accept?.includes(SPSP_CONTENT_TYPE_V4)) {
    throw new SPSPRouteError(
      406,
      `Request does not support ${SPSP_CONTENT_TYPE_V4}`
    )
  }

  const nonce = ctx.request.headers['receipt-nonce']
  const secret = ctx.request.headers['receipt-secret']

  if (!!nonce !== !!secret) {
    throw new SPSPRouteError(
      400,
      'Failed to generate credentials: receipt nonce and secret must accompany each other'
    )
  }

  try {
    const { ilpAddress, sharedSecret } = deps.streamServer.generateCredentials({
      paymentTag: ctx.paymentTag,
      receiptSetup:
        nonce && secret
          ? {
              nonce: Buffer.from(nonce.toString(), 'base64'),
              secret: Buffer.from(secret.toString(), 'base64')
            }
          : undefined,
      asset: ctx.asset
    })

    ctx.set('Content-Type', SPSP_CONTENT_TYPE_V4)
    ctx.body = JSON.stringify({
      destination_account: ilpAddress,
      shared_secret: base64url(sharedSecret),
      receipts_enabled: !!(nonce && secret)
    })
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Could not generate SPSP credentials'
    throw new SPSPRouteError(400, errorMessage, {
      paymentTag: ctx.paymentTag
    })
  }
}
