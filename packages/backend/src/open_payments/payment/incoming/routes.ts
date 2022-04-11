import base64url from 'base64url'
import { StreamServer } from '@interledger/stream-receiver'
import { Logger } from 'pino'
import { validateId } from '../../../shared/utils'
import { AppContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { AccountingService } from '../../../accounting/service'
import { IncomingPaymentService } from './service'
import { Amount, IncomingPayment, IncomingPaymentState } from './model'
import { errorToCode, errorToMessage, isIncomingPaymentError } from './errors'

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
  update(ctx: AppContext): Promise<void>
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
    create: (ctx: AppContext) => createIncomingPayment(deps, ctx),
    update: (ctx: AppContext) => updateIncomingPayment(deps, ctx)
  }
}

async function getIncomingPayment(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { incomingPaymentId } = ctx.params
  ctx.assert(validateId(incomingPaymentId), 400, 'invalid id')
  const acceptJSON = ctx.accepts('application/json')
  ctx.assert(acceptJSON, 406, 'must accept json')

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
  const { ilpAddress, sharedSecret } = getStreamCredentials(
    deps,
    incomingPayment
  )
  body['ilpAddress'] = ilpAddress
  body['sharedSecret'] = base64url(sharedSecret)
  ctx.body = body
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
  let incomingAmount: Amount | undefined
  try {
    incomingAmount = parseAmount(body['incomingAmount'])
  } catch (_) {
    return ctx.throw(400, 'invalid incomingAmount')
  }
  const expiresAt = Date.parse(body['expiresAt'] as string)
  if (!expiresAt) return ctx.throw(400, 'invalid expiresAt')
  if (body.description !== undefined && typeof body.description !== 'string')
    return ctx.throw(400, 'invalid description')
  if (body.externalRef !== undefined && typeof body.externalRef !== 'string')
    return ctx.throw(400, 'invalid externalRef')
  if (Date.now() + MAX_EXPIRY < expiresAt)
    return ctx.throw(400, 'expiry too high')
  if (expiresAt < Date.now()) return ctx.throw(400, 'already expired')

  const incomingPaymentOrError = await deps.incomingPaymentService.create({
    accountId,
    description: body.description,
    externalRef: body.externalRef,
    expiresAt: new Date(expiresAt),
    incomingAmount
  })

  if (isIncomingPaymentError(incomingPaymentOrError)) {
    return ctx.throw(
      errorToCode[incomingPaymentOrError],
      errorToMessage[incomingPaymentOrError]
    )
  }

  ctx.status = 201
  const res = incomingPaymentToBody(deps, incomingPaymentOrError, BigInt(0))
  const { ilpAddress, sharedSecret } = getStreamCredentials(
    deps,
    incomingPaymentOrError
  )
  res['ilpAddress'] = ilpAddress
  res['sharedSecret'] = base64url(sharedSecret)
  ctx.body = res
}

async function updateIncomingPayment(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { incomingPaymentId } = ctx.params
  ctx.assert(validateId(incomingPaymentId), 400, 'invalid id')
  const acceptJSON = ctx.accepts('application/json')
  ctx.assert(acceptJSON, 406, 'must accept json')
  ctx.assert(
    ctx.get('Content-Type') === 'application/json',
    400,
    'must send json body'
  )

  const { body } = ctx.request
  if (typeof body !== 'object') return ctx.throw(400, 'json body required')
  if (typeof body['state'] !== 'string') return ctx.throw(400, 'invalid state')
  const state = Object.values(IncomingPaymentState).find(
    (name) => name.toLowerCase() === body.state
  )
  if (state === undefined) return ctx.throw(400, 'invalid state')

  const incomingPaymentOrError = await deps.incomingPaymentService.update({
    id: incomingPaymentId,
    state
  })

  if (isIncomingPaymentError(incomingPaymentOrError)) {
    return ctx.throw(
      errorToCode[incomingPaymentOrError],
      errorToMessage[incomingPaymentOrError]
    )
  }

  const amountReceived = await deps.accountingService.getTotalReceived(
    incomingPaymentOrError.id
  )
  if (amountReceived === undefined) {
    deps.logger.error(
      { incomingPayment: incomingPaymentOrError.id },
      'account not found'
    )
    return ctx.throw(500)
  }

  const res = incomingPaymentToBody(
    deps,
    incomingPaymentOrError,
    amountReceived
  )
  ctx.body = res
}

function incomingPaymentToBody(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment,
  received: bigint
) {
  const location = `${deps.config.publicHost}/incoming-payments/${incomingPayment.id}`
  const body = {
    id: location,
    accountId: `${deps.config.publicHost}/pay/${incomingPayment.accountId}`,
    state: incomingPayment.state.toLowerCase(),
    receivedAmount: {
      amount: received.toString(),
      assetCode: incomingPayment.asset.code,
      assetScale: incomingPayment.asset.scale
    },
    expiresAt: incomingPayment.expiresAt.toISOString()
  }

  if (incomingPayment.incomingAmount) {
    body['incomingAmount'] = {
      amount: incomingPayment.incomingAmount.amount.toString(),
      assetCode: incomingPayment.incomingAmount.assetCode,
      assetScale: incomingPayment.incomingAmount.assetScale
    }
  }
  if (incomingPayment.description)
    body['description'] = incomingPayment.description
  if (incomingPayment.externalRef)
    body['externalRef'] = incomingPayment.externalRef
  // workaround: will be removed with update to ilp-pay:0.4.0-alpha.2
  body['receiptsEnabled'] = false
  return body
}

function parseAmount(amount: unknown): Amount | undefined {
  if (amount === undefined) return amount
  if (
    typeof amount !== 'object' ||
    amount === null ||
    (amount['assetCode'] && typeof amount['assetCode'] !== 'string') ||
    (amount['assetScale'] !== undefined &&
      typeof amount['assetScale'] !== 'number') ||
    amount['assetScale'] < 0
  ) {
    throw new Error('invalid amount')
  }
  return {
    amount: BigInt(amount['amount']),
    assetCode: amount['assetCode'],
    assetScale: amount['assetScale']
  }
}

function getStreamCredentials(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
) {
  return deps.streamServer.generateCredentials({
    paymentTag: incomingPayment.id,
    asset: {
      code: incomingPayment.asset.code,
      scale: incomingPayment.asset.scale
    }
  })
}
