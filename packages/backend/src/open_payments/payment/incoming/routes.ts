import base64url from 'base64url'
import { StreamServer } from '@interledger/stream-receiver'
import { Logger } from 'pino'
import { validateId } from '../../../shared/utils'
import { AppContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { IncomingPaymentService } from './service'
import { IncomingPayment, IncomingPaymentState } from './model'
import {
  errorToCode,
  errorToMessage,
  IncomingPaymentError,
  isIncomingPaymentError
} from './errors'
import { Amount, parseAmount } from '../../amount'
import {
  getListPageInfo,
  parsePaginationQueryParameters
} from '../../../shared/pagination'
import { Pagination } from '../../../shared/baseModel'

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

  let incomingPayment: IncomingPayment | undefined
  try {
    incomingPayment = await deps.incomingPaymentService.get(incomingPaymentId)
  } catch (err) {
    ctx.throw(500, 'Error trying to get incoming payment')
  }
  if (!incomingPayment) return ctx.throw(404)

  const body = incomingPaymentToBody(deps, incomingPayment)
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
  if (body['incomingAmount']) {
    try {
      incomingAmount = parseAmount(body['incomingAmount'])
    } catch (_) {
      return ctx.throw(400, 'invalid incomingAmount')
    }
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

  let incomingPaymentOrError: IncomingPayment | IncomingPaymentError
  try {
    incomingPaymentOrError = await deps.incomingPaymentService.update({
      id: incomingPaymentId,
      state
    })
  } catch (err) {
    ctx.throw(500, 'Error trying to update incoming payment')
  }

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
  // todo: validation
  const { accountId } = ctx.params
  const { first, last, cursor } = ctx.request.query
  let pagination: Pagination
  try {
    pagination = parsePaginationQueryParameters(first, last, cursor)
  } catch (err) {
    ctx.throw(404, err.message)
  }
  try {
    const page = await deps.incomingPaymentService.getAccountPage(
      accountId,
      pagination
    )
    const pageInfo = await getListPageInfo(
      (pagination: Pagination) =>
        deps.incomingPaymentService.getAccountPage(accountId, pagination),
      page,
      pagination
    )
    const result = {
      pagination: pageInfo,
      result: page.map((item: IncomingPayment) =>
        incomingPaymentToBody(deps, item)
      )
    }
    ctx.body = result
  } catch (_) {
    ctx.throw(500, 'Error trying to list incoming payments')
  }
}

function incomingPaymentToBody(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
) {
  return Object.fromEntries(
    Object.entries({
      ...incomingPayment.toJSON(),
      accountId: `${deps.config.publicHost}/${incomingPayment.accountId}`,
      id: `${deps.config.publicHost}/${incomingPayment.accountId}/incoming-payments/${incomingPayment.id}`
    }).filter(([_, v]) => v != null)
  )
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
