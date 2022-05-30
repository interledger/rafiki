import { Logger } from 'pino'
import { validateId } from '../../shared/utils'
import { AppContext } from '../../app'
import { IAppConfig } from '../../config/app'
import { QuoteService } from './service'
import { isQuoteError, errorToCode, errorToMessage } from './errors'
import { Quote } from './model'
import { Amount, parseAmount } from '../amount'
import {
  getListPageInfo,
  parsePaginationQueryParameters
} from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  quoteService: QuoteService
}

export interface QuoteRoutes {
  get(ctx: AppContext): Promise<void>
  create(ctx: AppContext): Promise<void>
  list(ctx: AppContext): Promise<void>
}

export function createQuoteRoutes(deps_: ServiceDependencies): QuoteRoutes {
  const logger = deps_.logger.child({
    service: 'QuoteRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: AppContext) => getQuote(deps, ctx),
    create: (ctx: AppContext) => createQuote(deps, ctx),
    list: (ctx: AppContext) => listQuotes(deps, ctx)
  }
}

async function getQuote(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { quoteId: quoteId } = ctx.params
  ctx.assert(validateId(quoteId), 400, 'invalid id')
  const acceptJSON = ctx.accepts('application/json')
  ctx.assert(acceptJSON, 406)

  const quote = await deps.quoteService.get(quoteId)
  if (!quote) return ctx.throw(404)

  const body = quoteToBody(deps, quote)
  ctx.body = body
}

async function createQuote(
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

  if (
    body.receivingAccount !== undefined &&
    typeof body.receivingAccount !== 'string'
  )
    return ctx.throw(400, 'invalid receivingAccount')
  let sendAmount: Amount | undefined
  if (body.sendAmount) {
    try {
      sendAmount = parseAmount(body.sendAmount)
    } catch (_) {
      return ctx.throw(400, 'invalid sendAmount')
    }
  }
  let receiveAmount: Amount | undefined
  if (body.receiveAmount) {
    try {
      receiveAmount = parseAmount(body.receiveAmount)
    } catch (_) {
      return ctx.throw(400, 'invalid receiveAmount')
    }
  }
  if (
    body.receivingPayment !== undefined &&
    typeof body.receivingPayment !== 'string'
  )
    return ctx.throw(400, 'invalid receivingPayment')

  if (body.description !== undefined && typeof body.description !== 'string')
    return ctx.throw(400, 'invalid description')
  if (body.externalRef !== undefined && typeof body.externalRef !== 'string')
    return ctx.throw(400, 'invalid externalRef')

  try {
    const quoteOrErr = await deps.quoteService.create({
      accountId,
      receivingAccount: body.receivingAccount,
      sendAmount,
      receiveAmount,
      receivingPayment: body.receivingPayment
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
    const page = await deps.quoteService.getAccountPage(accountId, pagination)
    const pageInfo = await getListPageInfo(
      (pagination: Pagination) =>
        deps.quoteService.getAccountPage(accountId, pagination),
      page,
      pagination
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
  const accountId = `${deps.config.publicHost}/${quote.accountId}`
  return Object.fromEntries(
    Object.entries({
      ...quote.toJSON(),
      id: `${accountId}/quotes/${quote.id}`,
      accountId
    }).filter(([_, v]) => v != null)
  )
}
