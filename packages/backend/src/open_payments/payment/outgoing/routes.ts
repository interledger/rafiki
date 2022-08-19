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
  try {
    outgoingPayment = await deps.outgoingPaymentService.get(
      ctx.params.outgoingPaymentId
    )
  } catch (_) {
    ctx.throw(500, 'Error trying to get outgoing payment')
  }
  if (!outgoingPayment) return ctx.throw(404)

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
    accountId: ctx.params.accountId,
    quoteId,
    description: body.description,
    externalRef: body.externalRef,
    grant: ctx.grant
  })

  if (isOutgoingPaymentError(paymentOrErr)) {
    return ctx.throw(errorToCode[paymentOrErr], errorToMessage[paymentOrErr])
  }

  ctx.status = 201
  const res = outgoingPaymentToBody(deps, paymentOrErr)
  ctx.body = res
}

async function listOutgoingPayments(
  deps: ServiceDependencies,
  ctx: ListContext
): Promise<void> {
  const { accountId } = ctx.params
  const pagination = parsePaginationQueryParameters(ctx.request.query)
  try {
    const page = await deps.outgoingPaymentService.getAccountPage(
      accountId,
      pagination
    )
    const pageInfo = await getPageInfo(
      (pagination: Pagination) =>
        deps.outgoingPaymentService.getAccountPage(accountId, pagination),
      page
    )
    const result = {
      pagination: pageInfo,
      result: page.map((item: OutgoingPayment) =>
        outgoingPaymentToBody(deps, item)
      )
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
      accountId: `${deps.config.publicHost}/${outgoingPayment.accountId}`,
      id: `${deps.config.publicHost}/${outgoingPayment.accountId}/outgoing-payments/${outgoingPayment.id}`,
      state: null,
      failed: outgoingPayment.state === OutgoingPaymentState.Failed
    }).filter(([_, v]) => v != null)
  )
}
