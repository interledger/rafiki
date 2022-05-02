import base64url from 'base64url'
import { StreamServer } from '@interledger/stream-receiver'
import { Logger } from 'pino'
import { validateId } from '../../../shared/utils'
import { AppContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { IncomingPaymentService } from './service'
import { IncomingPayment, IncomingPaymentState } from './model'
import { errorToCode, errorToMessage, isIncomingPaymentError } from './errors'
import { Amount } from '../amount'

// Don't allow creating an incoming payment too far out. Incoming payments with no payments before they expire are cleaned up, since incoming payments creation is unauthenticated.
// TODO what is a good default value for this?
export const MAX_EXPIRY = 24 * 60 * 60 * 1000 // milliseconds

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  incomingPaymentService: IncomingPaymentService
  streamServer: StreamServer
}

export interface IncomingPaymentRoutes {
  get(ctx: AppContext): Promise<void>
  create(ctx: AppContext): Promise<void>
  update(ctx: AppContext): Promise<void>
  list(ctx: AppContext): Promise<void>
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
    update: (ctx: AppContext) => updateIncomingPayment(deps, ctx),
    list: (ctx: AppContext) => listIncomingPayments(deps, ctx)
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

  const incomingPaymentOrError = await deps.incomingPaymentService.get(
    incomingPaymentId
  )
  if (isIncomingPaymentError(incomingPaymentOrError)) {
    return ctx.throw(
      errorToCode[incomingPaymentOrError],
      errorToMessage[incomingPaymentOrError]
    )
  }

  const body = incomingPaymentToBody(deps, incomingPaymentOrError)
  if (
    incomingPaymentOrError.state !== IncomingPaymentState.Expired &&
    incomingPaymentOrError.state !== IncomingPaymentState.Completed
  ) {
    const { ilpAddress, sharedSecret } = getStreamCredentials(
      deps,
      incomingPaymentOrError
    )
    body['ilpAddress'] = ilpAddress
    body['sharedSecret'] = base64url(sharedSecret)
  }
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
  let expiresAt: Date | undefined
  if (body.expiresAt !== undefined) {
    const expiry = Date.parse(body['expiresAt'] as string)
    if (!expiry) return ctx.throw(400, 'invalid expiresAt')
    if (Date.now() + MAX_EXPIRY < expiry)
      return ctx.throw(400, 'expiry too high')
    if (expiry < Date.now()) return ctx.throw(400, 'already expired')
    expiresAt = new Date(expiry)
  }
  if (body.description !== undefined && typeof body.description !== 'string')
    return ctx.throw(400, 'invalid description')
  if (body.externalRef !== undefined && typeof body.externalRef !== 'string')
    return ctx.throw(400, 'invalid externalRef')

  const incomingPaymentOrError = await deps.incomingPaymentService.create({
    accountId,
    description: body.description,
    externalRef: body.externalRef,
    expiresAt,
    incomingAmount
  })

  if (isIncomingPaymentError(incomingPaymentOrError)) {
    return ctx.throw(
      errorToCode[incomingPaymentOrError],
      errorToMessage[incomingPaymentOrError]
    )
  }

  ctx.status = 201
  const res = incomingPaymentToBody(deps, incomingPaymentOrError)
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

  const res = incomingPaymentToBody(deps, incomingPaymentOrError)
  ctx.body = res
}

async function listIncomingPayments(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const acceptJSON = ctx.accepts('application/json')
  ctx.assert(acceptJSON, 406, 'must accept json')
  const { accountId } = ctx.params
  ctx.assert(validateId(accountId), 400, 'invalid account id')
  const { first, last, cursor } = ctx.request.query
  if (
    (first !== undefined && isNaN(Number(first))) ||
    (last !== undefined && isNaN(Number(last))) ||
    (first && last) ||
    (last && !cursor) ||
    (typeof cursor !== 'string' && cursor !== undefined)
  )
    ctx.throw(400, 'invalid pagination parameters')
  const paginationParams = first
    ? {
        first: Number(first)
      }
    : last
    ? { last: Number(last) }
    : {}
  if (cursor) {
    ctx.assert(validateId(cursor), 400, 'invalid cursor')
    if (paginationParams.first) paginationParams['after'] = cursor
    if (paginationParams.last) paginationParams['before'] = cursor
  }
  const incomingPayments = await deps.incomingPaymentService.getAccountIncomingPaymentsPage(
    accountId,
    paginationParams
  )
  const result = incomingPayments.map((element) => {
    return incomingPaymentToBody(deps, element)
  })
  const pagination = {
    startCursor: incomingPayments[0].id,
    endCursor: incomingPayments[incomingPayments.length - 1].id
  }
  if (paginationParams.last) {
    pagination['last'] = incomingPayments.length
  } else {
    pagination['first'] = incomingPayments.length
  }

  ctx.body = { pagination, result }
}

function incomingPaymentToBody(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
) {
  const accountId = `${deps.config.publicHost}/${incomingPayment.accountId}`
  const body = {
    id: `${accountId}/incoming-payments/${incomingPayment.id}`,
    accountId,
    state: incomingPayment.state.toLowerCase(),
    receivedAmount: incomingPayment.receivedAmount
      ? {
          value: incomingPayment.receivedAmount.value.toString(),
          assetCode: incomingPayment.receivedAmount.assetCode,
          assetScale: incomingPayment.receivedAmount.assetScale
        }
      : 'error: account not found',
    expiresAt: incomingPayment.expiresAt.toISOString()
  }

  if (incomingPayment.incomingAmount) {
    body['incomingAmount'] = {
      value: incomingPayment.incomingAmount.value.toString(),
      assetCode: incomingPayment.incomingAmount.assetCode,
      assetScale: incomingPayment.incomingAmount.assetScale
    }
  }
  if (incomingPayment.description)
    body['description'] = incomingPayment.description
  if (incomingPayment.externalRef)
    body['externalRef'] = incomingPayment.externalRef
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
    value: BigInt(amount['value']),
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
