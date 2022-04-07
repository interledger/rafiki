import {
  MutationResolvers,
  Quote as SchemaQuote,
  QuoteConnectionResolvers,
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
  return {
    edges: quotes.map((quote: Quote) => ({
      cursor: quote.id,
      node: quoteToGraphql(quote)
    }))
  }
}

export const getQuotePageInfo: QuoteConnectionResolvers<ApolloContext>['pageInfo'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['PageInfo']> => {
  const logger = await ctx.container.use('logger')
  const quoteService = await ctx.container.use('quoteService')
  logger.info({ edges: parent.edges }, 'getPageInfo parent edges')

  const edges = parent.edges
  if (edges == null || typeof edges == 'undefined' || edges.length == 0)
    return {
      hasPreviousPage: false,
      hasNextPage: false
    }

  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  const firstPayment = await quoteService.get(edges[0].node.id)
  if (!firstPayment) throw 'quote does not exist'

  let hasNextPageQuotes, hasPreviousPageQuotes
  try {
    hasNextPageQuotes = await quoteService.getAccountPage(
      firstPayment.accountId,
      {
        after: lastEdge,
        first: 1
      }
    )
  } catch (e) {
    hasNextPageQuotes = []
  }
  try {
    hasPreviousPageQuotes = await quoteService.getAccountPage(
      firstPayment.accountId,
      {
        before: firstEdge,
        last: 1
      }
    )
  } catch (e) {
    hasPreviousPageQuotes = []
  }

  return {
    endCursor: lastEdge,
    hasNextPage: hasNextPageQuotes.length == 1,
    hasPreviousPage: hasPreviousPageQuotes.length == 1,
    startCursor: firstEdge
  }
}

export function quoteToGraphql(quote: Quote): SchemaQuote {
  return {
    id: quote.id,
    accountId: quote.accountId,
    receivingPayment: quote.receivingPayment,
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
