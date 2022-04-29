import base64url from 'base64url'
import { StreamServer } from '@interledger/stream-receiver'
import { Logger } from 'pino'
import { ReadContext, CreateContext, UpdateContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { IncomingPaymentService } from './service'
import { IncomingPayment, IncomingPaymentState } from './model'
import {
  errorToCode,
  errorToMessage,
  IncomingPaymentError,
  isIncomingPaymentError
} from './errors'
import { AmountJSON, parseAmount } from '../../amount'

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
  get(ctx: ReadContext): Promise<void>
  create(ctx: CreateContext<CreateBody>): Promise<void>
  update(ctx: UpdateContext<UpdateBody>): Promise<void>
}

export function createIncomingPaymentRoutes(
  deps_: ServiceDependencies
): IncomingPaymentRoutes {
  const logger = deps_.logger.child({
    service: 'IncomingPaymentRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: ReadContext) => getIncomingPayment(deps, ctx),
    create: (ctx: CreateContext<CreateBody>) =>
      createIncomingPayment(deps, ctx),
    update: (ctx: UpdateContext<UpdateBody>) => updateIncomingPayment(deps, ctx)
  }
}

async function getIncomingPayment(
  deps: ServiceDependencies,
  ctx: ReadContext
): Promise<void> {
  let incomingPayment: IncomingPayment | undefined
  try {
    incomingPayment = await deps.incomingPaymentService.get(ctx.params.id)
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

export type CreateBody = {
  description?: string
  expiresAt?: string
  incomingAmount?: AmountJSON
  externalRef?: string
}

async function createIncomingPayment(
  deps: ServiceDependencies,
  ctx: CreateContext<CreateBody>
): Promise<void> {
  const { body } = ctx.request

  let expiresAt: Date | undefined
  if (body.expiresAt !== undefined) {
    expiresAt = new Date(body.expiresAt)
    if (Date.now() + MAX_EXPIRY < expiresAt.getTime())
      return ctx.throw(400, 'expiry too high')
  }

  const incomingPaymentOrError = await deps.incomingPaymentService.create({
    accountId: ctx.params.accountId,
    description: body.description,
    externalRef: body.externalRef,
    expiresAt,
    incomingAmount: body.incomingAmount && parseAmount(body.incomingAmount)
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

export type UpdateBody = {
  state: string
}

async function updateIncomingPayment(
  deps: ServiceDependencies,
  ctx: UpdateContext<UpdateBody>
): Promise<void> {
  let incomingPaymentOrError: IncomingPayment | IncomingPaymentError
  try {
    incomingPaymentOrError = await deps.incomingPaymentService.update({
      id: ctx.params.id,
      state: IncomingPaymentState.Completed
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

function incomingPaymentToBody(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
) {
  const accountId = `${deps.config.publicHost}/${incomingPayment.accountId}`
  const body = {
    id: `${accountId}/incoming-payments/${incomingPayment.id}`,
    accountId,
    state: incomingPayment.state.toLowerCase(),
    receivedAmount: {
      value: incomingPayment.receivedAmount.value.toString(),
      assetCode: incomingPayment.receivedAmount.assetCode,
      assetScale: incomingPayment.receivedAmount.assetScale
    },
    expiresAt: incomingPayment.expiresAt.toISOString(),
    createdAt: incomingPayment.createdAt.toISOString(),
    updatedAt: incomingPayment.updatedAt.toISOString()
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
