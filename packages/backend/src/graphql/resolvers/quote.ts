import {
  MutationResolvers,
  Quote as SchemaQuote,
  WalletAddressResolvers,
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
import { CreateQuoteOptions } from '../../open_payments/quote/service'

export const getQuote: QueryResolvers<ApolloContext>['quote'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['Quote']> => {
  const quoteService = await ctx.container.use('quoteService')
  const quote = await quoteService.get({
    id: args.id
  })
  if (!quote) throw new Error('quote does not exist')
  return quoteToGraphql(quote)
}

export const createQuote: MutationResolvers<ApolloContext>['createQuote'] =
  async (parent, args, ctx): Promise<ResolversTypes['QuoteResponse']> => {
    const quoteService = await ctx.container.use('quoteService')
    const options: CreateQuoteOptions = {
      walletAddressId: args.input.walletAddressId,
      receiver: args.input.receiver
    }
    if (args.input.debitAmount) options.debitAmount = args.input.debitAmount
    if (args.input.receiveAmount)
      options.receiveAmount = args.input.receiveAmount
    return quoteService
      .create(options)
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

export const getWalletAddressQuotes: WalletAddressResolvers<ApolloContext>['quotes'] =
  async (parent, args, ctx): Promise<ResolversTypes['QuoteConnection']> => {
    if (!parent.id) throw new Error('missing wallet address id')
    const quoteService = await ctx.container.use('quoteService')
    const quotes = await quoteService.getWalletAddressPage({
      walletAddressId: parent.id,
      pagination: args
    })
    const pageInfo = await getPageInfo(
      (pagination: Pagination) =>
        quoteService.getWalletAddressPage({
          walletAddressId: parent.id as string,
          pagination
        }),
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
    walletAddressId: quote.walletAddressId,
    receiver: quote.receiver,
    debitAmount: quote.debitAmount,
    receiveAmount: quote.receiveAmount,
    maxPacketAmount: quote.maxPacketAmount,
    minExchangeRate: quote.minExchangeRate.valueOf(),
    lowEstimatedExchangeRate: quote.lowEstimatedExchangeRate.valueOf(),
    highEstimatedExchangeRate: quote.highEstimatedExchangeRate.valueOf(),
    createdAt: new Date(+quote.createdAt).toISOString(),
    expiresAt: new Date(+quote.expiresAt).toISOString()
  }
}
