import { Logger } from 'pino'
import { ReadContext, CreateContext, ListContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { OutgoingPaymentService } from './service'
import { isOutgoingPaymentError, errorToCode, errorToMessage } from './errors'
import { OutgoingPayment, OutgoingPaymentState } from './model'
import {
  getPageInfo,
  parsePaginationQueryParameters
} from '../../../shared/pagination'
import { Pagination } from '../../../shared/baseModel'
import { AccessAction } from '../../auth/grant'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  outgoingPaymentService: OutgoingPaymentService
}

export interface OutgoingPaymentRoutes {
  get(ctx: ReadContext): Promise<void>
  create(ctx: CreateContext<CreateBody>): Promise<void>
  list(ctx: ListContext): Promise<void>
}

export function createOutgoingPaymentRoutes(
  deps_: ServiceDependencies
): OutgoingPaymentRoutes {
  const logger = deps_.logger.child({
    service: 'OutgoingPaymentRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: ReadContext) => getOutgoingPayment(deps, ctx),
    create: (ctx: CreateContext<CreateBody>) =>
      createOutgoingPayment(deps, ctx),
    list: (ctx: ListContext) => listOutgoingPayments(deps, ctx)
  }
}

async function getOutgoingPayment(
  deps: ServiceDependencies,
  ctx: ReadContext
): Promise<void> {
  let outgoingPayment: OutgoingPayment | undefined
  let clientId = undefined
  const outgoingAccess = ctx.grant?.access.filter(
    (access) => access.type === 'outgoing-payment'
  )
  if (outgoingAccess && outgoingAccess.length === 1) {
    clientId = outgoingAccess[0].actions.includes(AccessAction.ReadAll)
      ? undefined
      : ctx.grant.clientId
  }
  try {
    outgoingPayment = await deps.outgoingPaymentService.get(
      ctx.params.id,
      clientId
    )
  } catch (_) {
    ctx.throw(500, 'Error trying to get outgoing payment')
  }
  if (!outgoingPayment) return ctx.throw(404)
  outgoingPayment.paymentPointer = ctx.paymentPointer
  const body = outgoingPaymentToBody(deps, outgoingPayment)
  ctx.body = body
}

export type CreateBody = {
  quoteId: string
  description?: string
  externalRef?: string
}

async function createOutgoingPayment(
  deps: ServiceDependencies,
  ctx: CreateContext<CreateBody>
): Promise<void> {
  const { body } = ctx.request

  const quoteUrlParts = body.quoteId.split('/')
  const quoteId = quoteUrlParts.pop() || quoteUrlParts.pop() // handle trailing slash
  if (!quoteId) {
    return ctx.throw(400, 'invalid quoteId')
  }

  const paymentOrErr = await deps.outgoingPaymentService.create({
    paymentPointerId: ctx.paymentPointer.id,
    quoteId,
    description: body.description,
    externalRef: body.externalRef,
    grant: ctx.grant
  })

  if (isOutgoingPaymentError(paymentOrErr)) {
    return ctx.throw(errorToCode[paymentOrErr], errorToMessage[paymentOrErr])
  }
  paymentOrErr.paymentPointer = ctx.paymentPointer
  ctx.status = 201
  const res = outgoingPaymentToBody(deps, paymentOrErr)
  ctx.body = res
}

async function listOutgoingPayments(
  deps: ServiceDependencies,
  ctx: ListContext
): Promise<void> {
  const pagination = parsePaginationQueryParameters(ctx.request.query)
  let clientId = undefined
  const outgoingAccess = ctx.grant?.access.filter(
    (access) => access.type === 'outgoing-payment'
  )
  if (outgoingAccess && outgoingAccess.length === 1) {
    clientId = outgoingAccess[0].actions.includes(AccessAction.ListAll)
      ? undefined
      : ctx.grant.clientId
  }
  try {
    const page = await deps.outgoingPaymentService.getPaymentPointerPage(
      ctx.paymentPointer.id,
      pagination,
      clientId
    )
    const pageInfo = await getPageInfo(
      (pagination: Pagination) =>
        deps.outgoingPaymentService.getPaymentPointerPage(
          ctx.paymentPointer.id,
          pagination
        ),
      page
    )
    const result = {
      pagination: pageInfo,
      result: page.map((item: OutgoingPayment) => {
        item.paymentPointer = ctx.paymentPointer
        return outgoingPaymentToBody(deps, item)
      })
    }
    ctx.body = result
  } catch (_) {
    ctx.throw(500, 'Error trying to list outgoing payments')
  }
}

function outgoingPaymentToBody(
  deps: ServiceDependencies,
  outgoingPayment: OutgoingPayment
) {
  return Object.fromEntries(
    Object.entries({
      ...outgoingPayment.toJSON(),
      id: `${outgoingPayment.paymentPointer.url}/outgoing-payments/${outgoingPayment.id}`,
      paymentPointer: outgoingPayment.paymentPointer.url,
      state: null,
      failed: outgoingPayment.state === OutgoingPaymentState.Failed
    }).filter(([_, v]) => v != null)
  )
}
