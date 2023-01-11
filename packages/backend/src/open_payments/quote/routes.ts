import { Logger } from 'pino'
import { ReadContext, CreateContext } from '../../app'
import { IAppConfig } from '../../config/app'
import { QuoteService } from './service'
import { isQuoteError, errorToCode, errorToMessage } from './errors'
import { Quote } from './model'
import { AmountJSON, parseAmount } from '../amount'
import { PaymentPointer } from '../payment_pointer/model'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  quoteService: QuoteService
}

export interface QuoteRoutes {
  get(ctx: ReadContext): Promise<void>
  create(ctx: CreateContext<CreateBody>): Promise<void>
}

export function createQuoteRoutes(deps_: ServiceDependencies): QuoteRoutes {
  const logger = deps_.logger.child({
    service: 'QuoteRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: ReadContext) => getQuote(deps, ctx),
    create: (ctx: CreateContext<CreateBody>) => createQuote(deps, ctx)
  }
}

async function getQuote(
  deps: ServiceDependencies,
  ctx: ReadContext
): Promise<void> {
  const quote = await deps.quoteService.get({
    id: ctx.params.id,
    clientId: ctx.clientId,
    paymentPointerId: ctx.paymentPointer.id
  })
  if (!quote) return ctx.throw(404)
  const body = quoteToBody(deps, quote, ctx.paymentPointer)
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
      paymentPointerId: ctx.paymentPointer.id,
      receiver: body.receiver,
      sendAmount: body.sendAmount && parseAmount(body.sendAmount),
      receiveAmount: body.receiveAmount && parseAmount(body.receiveAmount),
      clientId: ctx.grant?.clientId
    })

    if (isQuoteError(quoteOrErr)) {
      throw quoteOrErr
    }

    ctx.status = 201
    const res = quoteToBody(deps, quoteOrErr, ctx.paymentPointer)
    ctx.body = res
  } catch (err) {
    if (isQuoteError(err)) {
      return ctx.throw(errorToCode[err], errorToMessage[err])
    }
    deps.logger.debug({ error: err && err['message'] })
    ctx.throw(500, 'Error trying to create quote')
  }
}

function quoteToBody(
  deps: ServiceDependencies,
  quote: Quote,
  paymentPointer: PaymentPointer
) {
  return Object.fromEntries(
    Object.entries({
      ...quote.toJSON(),
      id: `${paymentPointer.url}/quotes/${quote.id}`,
      paymentPointer: paymentPointer.url,
      paymentPointerId: undefined
    }).filter(([_, v]) => v != null)
  )
}
