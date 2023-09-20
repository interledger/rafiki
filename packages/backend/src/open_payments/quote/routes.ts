import { AccessAction } from '@interledger/open-payments'
import { Logger } from 'pino'
import { ReadContext, CreateContext } from '../../app'
import { IAppConfig } from '../../config/app'
import { CreateQuoteOptions, QuoteService } from './service'
import { isQuoteError, errorToCode, errorToMessage } from './errors'
import { Quote } from './model'
import { AmountJSON, parseAmount } from '../amount'
import { Quote as OpenPaymentsQuote } from '@interledger/open-payments'
import { WalletAddress } from '../wallet_address/model'

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
    client: ctx.accessAction === AccessAction.Read ? ctx.client : undefined,
    walletAddressId: ctx.walletAddress.id
  })
  if (!quote) return ctx.throw(404)
  ctx.body = quoteToBody(ctx.walletAddress, quote)
}

interface CreateBodyBase {
  receiver: string
}

interface CreateBodyWithDebitAmount extends CreateBodyBase {
  debitAmount?: AmountJSON
  receiveAmount?: never
}

interface CreateBodyWithReceiveAmount extends CreateBodyBase {
  debitAmount?: never
  receiveAmount?: AmountJSON
}

export type CreateBody = CreateBodyWithDebitAmount | CreateBodyWithReceiveAmount

async function createQuote(
  deps: ServiceDependencies,
  ctx: CreateContext<CreateBody>
): Promise<void> {
  const { body } = ctx.request
  const options: CreateQuoteOptions = {
    walletAddressId: ctx.walletAddress.id,
    receiver: body.receiver,
    client: ctx.client
  }
  if (body.debitAmount) options.debitAmount = parseAmount(body.debitAmount)
  if (body.receiveAmount)
    options.receiveAmount = parseAmount(body.receiveAmount)
  try {
    const quoteOrErr = await deps.quoteService.create(options)

    if (isQuoteError(quoteOrErr)) {
      throw quoteOrErr
    }

    ctx.status = 201
    ctx.body = quoteToBody(ctx.walletAddress, quoteOrErr)
  } catch (err) {
    if (isQuoteError(err)) {
      return ctx.throw(errorToCode[err], errorToMessage[err])
    }
    deps.logger.debug({ error: err instanceof Error && err.message })
    ctx.throw(500, 'Error trying to create quote')
  }
}

function quoteToBody(
  walletAddress: WalletAddress,
  quote: Quote
): OpenPaymentsQuote {
  return quote.toOpenPaymentsType(walletAddress)
}
