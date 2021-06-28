import { BaseService } from '../shared/baseService'
import { AppContext } from '../app'
import { AccountService } from '../account/service'
import { UserService } from '../user/service'
import { validate } from 'uuid'
import base64url from 'base64url'
import { StreamServer } from '@interledger/stream-receiver'

const CONTENT_TYPE_V4 = 'application/spsp4+json'

export interface SPSPService {
  GETPayEndpoint(ctx: AppContext): Promise<void>
}

interface ServiceDependencies extends BaseService {
  accountService: AccountService
  userService: UserService
  streamServer: StreamServer
}

export async function createSPSPService({
  logger,
  accountService,
  userService,
  streamServer
}: ServiceDependencies): Promise<SPSPService> {
  const log = logger.child({
    service: 'UserService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    accountService: accountService,
    userService: userService,
    streamServer: streamServer
  }
  return {
    GETPayEndpoint: (ctx) => getPay(deps, ctx)
  }
}

async function getPay(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  if (!validate(ctx.params.id)) {
    ctx.throw(400, 'Failed to generate credentials: invalid user id')
  }

  if (!ctx.get('accept').includes(CONTENT_TYPE_V4)) {
    ctx.throw(
      406,
      `Failed to generate credentials: invalid accept: must support ${CONTENT_TYPE_V4}`
    )
  }

  const nonce = ctx.request.headers['receipt-nonce']
  const secret = ctx.request.headers['receipt-secret']
  if (!nonce !== !secret) {
    ctx.throw(
      400,
      'Failed to generate credentials: receipt nonce and secret must accompany each other'
    )
  }

  const user = await deps.userService.get(ctx.params.id)
  const account = user && (await deps.accountService.get(user.accountId))
  if (!account) {
    ctx.status = 404
    ctx.set('Content-Type', CONTENT_TYPE_V4)
    ctx.body = JSON.stringify({
      id: 'InvalidReceiverError',
      message: 'Invalid receiver ID'
    })
    return
  }

  try {
    const { ilpAddress, sharedSecret } = deps.streamServer.generateCredentials({
      paymentTag: user.accountId,
      receiptSetup:
        nonce && secret
          ? {
              nonce: Buffer.from(nonce.toString(), 'base64'),
              secret: Buffer.from(secret.toString(), 'base64')
            }
          : undefined,
      asset: {
        code: account.currency,
        scale: account.scale
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
