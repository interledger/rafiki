import { Logger } from 'pino'
import { ReadContext, CreateContext, ListContext } from '../../app'
import { IAppConfig } from '../../config/app'
import { QuoteService } from './service'
import { isQuoteError, errorToCode, errorToMessage } from './errors'
import { Quote } from './model'
import { AmountJSON, parseAmount } from '../amount'
import {
  getPageInfo,
  parsePaginationQueryParameters
} from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  quoteService: QuoteService
}

export interface QuoteRoutes {
  get(ctx: ReadContext): Promise<void>
  create(ctx: CreateContext<CreateBody>): Promise<void>
  list(ctx: ListContext): Promise<void>
}

export function createQuoteRoutes(deps_: ServiceDependencies): QuoteRoutes {
  const logger = deps_.logger.child({
    service: 'QuoteRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: ReadContext) => getQuote(deps, ctx),
    create: (ctx: CreateContext<CreateBody>) => createQuote(deps, ctx),
    list: (ctx: ListContext) => listQuotes(deps, ctx)
  }
}

async function getQuote(
  deps: ServiceDependencies,
  ctx: ReadContext
): Promise<void> {
  const quote = await deps.quoteService.get(ctx.params.quoteId)
  if (!quote) return ctx.throw(404)

  const body = quoteToBody(deps, quote)
  ctx.body = body
}

export type CreateBody = {
  receiver: string
  sendAmount?: AmountJSON
  receiveAmount?: AmountJSON
}

async function createQuote(
  deps: ServiceDependencies,
  ctx: CreateContext<CreateBody>
): Promise<void> {
  const { body } = ctx.request
  try {
    const quoteOrErr = await deps.quoteService.create({
      paymentPointerId: ctx.params.accountId,
      receiver: body.receiver,
      sendAmount: body.sendAmount && parseAmount(body.sendAmount),
      receiveAmount: body.receiveAmount && parseAmount(body.receiveAmount)
    })

    if (isQuoteError(quoteOrErr)) {
      throw quoteOrErr
    }

    ctx.status = 201
    const res = quoteToBody(deps, quoteOrErr)
    ctx.body = res
  } catch (err) {
    if (isQuoteError(err)) {
      return ctx.throw(errorToCode[err], errorToMessage[err])
    }
    deps.logger.debug({ error: err.message })
    ctx.throw(500, 'Error trying to create quote')
  }
}

async function listQuotes(
  deps: ServiceDependencies,
  ctx: ListContext
): Promise<void> {
  const { accountId: paymentPointerId } = ctx.params
  const pagination = parsePaginationQueryParameters(ctx.request.query)
  try {
    const page = await deps.quoteService.getPaymentPointerPage(
      paymentPointerId,
      pagination
    )
    const pageInfo = await getPageInfo(
      (pagination: Pagination) =>
        deps.quoteService.getPaymentPointerPage(paymentPointerId, pagination),
      page
    )
    const result = {
      pagination: pageInfo,
      result: page.map((item: Quote) => quoteToBody(deps, item))
    }
    ctx.body = result
  } catch (_) {
    ctx.throw(500, 'Error trying to list quotes')
  }
}

function quoteToBody(deps: ServiceDependencies, quote: Quote) {
  const accountId = `${deps.config.openPaymentsHost}/${quote.paymentPointerId}`
  return Object.fromEntries(
    Object.entries({
      ...quote.toJSON(),
      id: `${accountId}/quotes/${quote.id}`,
      // paymentPointer
      accountId,
      paymentPointerId: undefined
    }).filter(([_, v]) => v != null)
  )
}
