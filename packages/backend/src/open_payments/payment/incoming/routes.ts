import base64url from 'base64url'
import { StreamServer } from '@interledger/stream-receiver'
import { Logger } from 'pino'
import { validateId } from '../../../shared/utils'
import { AppContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { AccountingService } from '../../../accounting/service'
import { IncomingPaymentService } from './service'
import { IncomingPayment } from './model'

// Don't allow creating an incoming payment too far out. Incoming payments with no payments before they expire are cleaned up, since incoming payments creation is unauthenticated.
// TODO what is a good default value for this?
export const MAX_EXPIRY = 24 * 60 * 60 * 1000 // milliseconds

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  accountingService: AccountingService
  incomingPaymentService: IncomingPaymentService
  streamServer: StreamServer
}

export interface IncomingPaymentRoutes {
  get(ctx: AppContext): Promise<void>
  create(ctx: AppContext): Promise<void>
}

export function createIncomingPaymentRoutes(
  deps_: ServiceDependencies
): IncomingPaymentRoutes {
  const logger = deps_.logger.child({
    service: 'IncomingPaymentRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: AppContext) => getIncomingPayment(deps, ctx),
    create: (ctx: AppContext) => createIncomingPayment(deps, ctx)
  }
}

async function getIncomingPayment(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { incomingPaymentId: incomingPaymentId } = ctx.params
  ctx.assert(validateId(incomingPaymentId), 400, 'invalid id')
  const acceptJSON = ctx.accepts('application/json')
  const acceptStream = ctx.accepts('application/ilp-stream+json')
  ctx.assert(acceptJSON || acceptStream, 406)

  const incomingPayment = await deps.incomingPaymentService.get(
    incomingPaymentId
  )
  if (!incomingPayment) return ctx.throw(404)

  const amountReceived = await deps.accountingService.getTotalReceived(
    incomingPayment.id
  )
  if (amountReceived === undefined) {
    deps.logger.error(
      { incomingPayment: incomingPayment.id },
      'account not found'
    )
    return ctx.throw(500)
  }

  const body = incomingPaymentToBody(deps, incomingPayment, amountReceived)
  ctx.body = body
  if (!acceptStream) return

  const { ilpAddress, sharedSecret } = deps.streamServer.generateCredentials({
    paymentTag: incomingPayment.id,
    // TODO receipt support on incoming payments?
    //receiptSetup:
    //  nonce && secret
    //    ? {
    //        nonce: Buffer.from(nonce.toString(), 'base64'),
    //        secret: Buffer.from(secret.toString(), 'base64')
    //      }
    //    : undefined,
    asset: {
      code: incomingPayment.account.asset.code,
      scale: incomingPayment.account.asset.scale
    }
  })

  body['ilpAddress'] = ilpAddress
  body['sharedSecret'] = base64url(sharedSecret)
}

async function createIncomingPayment(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { accountId } = ctx.params
  ctx.assert(validateId(accountId), 400, 'invalid account id')
  ctx.assert(ctx.accepts('application/json'), 406, 'must accept json')
  ctx.assert(
    ctx.get('Content-Type') === 'application/json',
    400,
    'must send json body'
  )

  const { body } = ctx.request
  if (typeof body !== 'object') return ctx.throw(400, 'json body required')
  const incomingAmount = tryParseAmount(body['incomingAmount'])
  if (incomingAmount === null) return ctx.throw(400, 'invalid incomingAmount')
  const expiresAt = Date.parse(body['expiresAt'] as string)
  if (!expiresAt) return ctx.throw(400, 'invalid expiresAt')
  if (body.description !== undefined && typeof body.description !== 'string')
    return ctx.throw(400, 'invalid description')
  if (body.externalRef !== undefined && typeof body.externalRef !== 'string')
    return ctx.throw(400, 'invalid externalRef')
  if (Date.now() + MAX_EXPIRY < expiresAt)
    return ctx.throw(400, 'expiry too high')
  if (expiresAt < Date.now()) return ctx.throw(400, 'already expired')

  const incomingPayment = await deps.incomingPaymentService.create({
    accountId,
    description: body.description,
    externalRef: body.externalRef,
    expiresAt: new Date(expiresAt),
    incomingAmount
  })

  ctx.status = 201
  const res = incomingPaymentToBody(deps, incomingPayment, BigInt(0))
  ctx.body = res
  ctx.set('Location', res.id)
}

function incomingPaymentToBody(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment,
  received: bigint
) {
  const location = `${deps.config.publicHost}/incoming-payments/${incomingPayment.id}`
  return {
    id: location,
    account: `${deps.config.publicHost}/pay/${incomingPayment.accountId}`,
    state: incomingPayment.state.toLowerCase(),
    amount: incomingPayment.incomingAmount
      ? incomingPayment.incomingAmount.toString()
      : null,
    assetCode: incomingPayment.account.asset.code,
    assetScale: incomingPayment.account.asset.scale,
    description: incomingPayment.description,
    externalRef: incomingPayment.externalRef,
    expiresAt: incomingPayment.expiresAt.toISOString(),
    received: received.toString()
  }
}

function tryParseAmount(incomingAmount: unknown): bigint | undefined | null {
  if (incomingAmount == undefined) return undefined
  try {
    return BigInt(incomingAmount)
  } catch (_) {
    return null
  }
}
