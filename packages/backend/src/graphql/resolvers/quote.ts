import {
  MutationResolvers,
  Quote as SchemaQuote,
  AccountResolvers,
  QueryResolvers,
  ResolversTypes
} from '../generated/graphql'
import {
  QuoteError,
  isQuoteError,
  errorToCode,
  errorToMessage
} from '../../open_payments/quote/errors'
import { Quote } from '../../open_payments/quote/model'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'

export const getQuote: QueryResolvers<ApolloContext>['quote'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['Quote']> => {
  const quoteService = await ctx.container.use('quoteService')
  const quote = await quoteService.get(args.id)
  if (!quote) throw new Error('quote does not exist')
  return quoteToGraphql(quote)
}

export const createQuote: MutationResolvers<ApolloContext>['createQuote'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['QuoteResponse']> => {
  const quoteService = await ctx.container.use('quoteService')
  return quoteService
    .create(args.input)
    .then((quoteOrErr: Quote | QuoteError) =>
      isQuoteError(quoteOrErr)
        ? {
            code: errorToCode[quoteOrErr].toString(),
            success: false,
            message: errorToMessage[quoteOrErr]
          }
        : {
            code: '200',
            success: true,
            quote: quoteToGraphql(quoteOrErr)
          }
    )
    .catch(() => ({
      code: '500',
      success: false,
      message: 'Error trying to create quote'
    }))
}

export const getAccountQuotes: AccountResolvers<ApolloContext>['quotes'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['QuoteConnection']> => {
  if (!parent.id) throw new Error('missing account id')
  const quoteService = await ctx.container.use('quoteService')
  const quotes = await quoteService.getAccountPage(parent.id, args)
  const pageInfo = await getPageInfo(
    (pagination: Pagination) =>
      quoteService.getAccountPage(parent.id as string, pagination),
    quotes
  )
  return {
    pageInfo,
    edges: quotes.map((quote: Quote) => ({
      cursor: quote.id,
      node: quoteToGraphql(quote)
    }))
  }
}

export function quoteToGraphql(quote: Quote): SchemaQuote {
  return {
    id: quote.id,
    accountId: quote.accountId,
    receiver: quote.receiver,
    sendAmount: quote.sendAmount,
    receiveAmount: quote.receiveAmount,
    maxPacketAmount: quote.maxPacketAmount,
    minExchangeRate: quote.minExchangeRate.valueOf(),
    lowEstimatedExchangeRate: quote.lowEstimatedExchangeRate.valueOf(),
    highEstimatedExchangeRate: quote.highEstimatedExchangeRate.valueOf(),
    createdAt: new Date(+quote.createdAt).toISOString(),
    expiresAt: new Date(+quote.expiresAt).toISOString()
  }
}
