import { Logger } from 'pino'
import {
  ReadContext,
  CreateContext,
  CompleteContext,
  ListContext
} from '../../../app'
import { IAppConfig } from '../../../config/app'
import { IncomingPaymentService } from './service'
import { IncomingPayment, IncomingPaymentJSON } from './model'
import {
  errorToCode,
  errorToMessage,
  IncomingPaymentError,
  isIncomingPaymentError
} from './errors'
import { AmountJSON, parseAmount } from '../../amount'
import { listSubresource } from '../../payment_pointer/routes'
import { ConnectionJSON } from '../../connection/model'
import { ConnectionService } from '../../connection/service'

// Don't allow creating an incoming payment too far out. Incoming payments with no payments before they expire are cleaned up, since incoming payments creation is unauthenticated.
// TODO what is a good default value for this?
export const MAX_EXPIRY = 24 * 60 * 60 * 1000 // milliseconds

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  incomingPaymentService: IncomingPaymentService
  connectionService: ConnectionService
}

export interface IncomingPaymentRoutes {
  get(ctx: ReadContext): Promise<void>
  create(ctx: CreateContext<CreateBody>): Promise<void>
  complete(ctx: CompleteContext): Promise<void>
  list(ctx: ListContext): Promise<void>
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
    complete: (ctx: CompleteContext) => completeIncomingPayment(deps, ctx),
    list: (ctx: ListContext) => listIncomingPayments(deps, ctx)
  }
}

async function getIncomingPayment(
  deps: ServiceDependencies,
  ctx: ReadContext
): Promise<void> {
  let incomingPayment: IncomingPayment | undefined
  try {
    incomingPayment = await deps.incomingPaymentService.get({
      id: ctx.params.id,
      clientId: ctx.clientId,
      paymentPointerId: ctx.paymentPointer.id
    })
  } catch (err) {
    ctx.throw(500, 'Error trying to get incoming payment')
  }
  if (!incomingPayment) return ctx.throw(404)
  const connection = deps.connectionService.get(incomingPayment)
  ctx.body = incomingPaymentToBody(deps, incomingPayment, connection?.toJSON())
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
    paymentPointerId: ctx.paymentPointer.id,
    clientId: ctx.grant?.clientId,
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
  const connection = deps.connectionService.get(incomingPaymentOrError)
  ctx.body = incomingPaymentToBody(
    deps,
    incomingPaymentOrError,
    connection?.toJSON()
  )
}

async function completeIncomingPayment(
  deps: ServiceDependencies,
  ctx: CompleteContext
): Promise<void> {
  let incomingPaymentOrError: IncomingPayment | IncomingPaymentError
  try {
    incomingPaymentOrError = await deps.incomingPaymentService.complete(
      ctx.params.id
    )
  } catch (err) {
    ctx.throw(500, 'Error trying to complete incoming payment')
  }

  if (isIncomingPaymentError(incomingPaymentOrError)) {
    return ctx.throw(
      errorToCode[incomingPaymentOrError],
      errorToMessage[incomingPaymentOrError]
    )
  }
  ctx.body = incomingPaymentToBody(deps, incomingPaymentOrError)
}

async function listIncomingPayments(
  deps: ServiceDependencies,
  ctx: ListContext
): Promise<void> {
  try {
    await listSubresource({
      ctx,
      getPaymentPointerPage: deps.incomingPaymentService.getPaymentPointerPage,
      toBody: (payment) =>
        incomingPaymentToBody(
          deps,
          payment,
          deps.connectionService.getUrl(payment)
        )
    })
  } catch (_) {
    ctx.throw(500, 'Error trying to list incoming payments')
  }
}

function incomingPaymentToBody(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment,
  ilpStreamConnection?: ConnectionJSON | string
): IncomingPaymentJSON {
  const body = {
    ...incomingPayment.toJSON(),
    id: incomingPayment.url,
    paymentPointer: incomingPayment.paymentPointer.url
  } as unknown as IncomingPaymentJSON
  if (ilpStreamConnection) {
    body.ilpStreamConnection = ilpStreamConnection
  }
  return body
}
