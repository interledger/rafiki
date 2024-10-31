import {
  MutationResolvers,
  Quote as SchemaQuote,
  WalletAddressResolvers,
  QueryResolvers,
  ResolversTypes
} from '../generated/graphql'
import {
  isQuoteError,
  errorToCode,
  errorToMessage
} from '../../open_payments/quote/errors'
import { Quote } from '../../open_payments/quote/model'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { CreateQuoteOptions } from '../../open_payments/quote/service'
import { GraphQLError } from 'graphql'
import { GraphQLErrorCode } from '../errors'

export const getQuote: QueryResolvers<ApolloContext>['quote'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['Quote']> => {
  const quoteService = await ctx.container.use('quoteService')
  const quote = await quoteService.get({
    id: args.id
  })
  if (
    !quote ||
    !(await quoteService.canAccess(ctx.isOperator, ctx.tenantId, quote))
  ) {
    throw new GraphQLError('quote does not exist', {
      extensions: {
        code: GraphQLErrorCode.NotFound
      }
    })
  }

  return quoteToGraphql(quote)
}

export const createQuote: MutationResolvers<ApolloContext>['createQuote'] =
  async (parent, args, ctx): Promise<ResolversTypes['QuoteResponse']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const canAccess = await walletAddressService.canAccess(
      ctx.isOperator,
      ctx.tenantId,
      args.input.walletAddressId
    )
    if (!canAccess) {
      throw new GraphQLError('Unknown wallet address id input', {
        extensions: {
          code: GraphQLErrorCode.BadUserInput,
          walletAddressId: args.input.walletAddressId
        }
      })
    }

    const quoteService = await ctx.container.use('quoteService')
    const options: CreateQuoteOptions = {
      walletAddressId: args.input.walletAddressId,
      receiver: args.input.receiver,
      method: 'ilp'
    }
    if (args.input.debitAmount) options.debitAmount = args.input.debitAmount
    if (args.input.receiveAmount)
      options.receiveAmount = args.input.receiveAmount
    const quoteOrError = await quoteService.create(options)
    if (isQuoteError(quoteOrError)) {
      throw new GraphQLError(errorToMessage[quoteOrError], {
        extensions: {
          code: errorToCode[quoteOrError]
        }
      })
    } else
      return {
        quote: quoteToGraphql(quoteOrError)
      }
  }

// TODO: access control. need to add tenantId to getPage
export const getWalletAddressQuotes: WalletAddressResolvers<ApolloContext>['quotes'] =
  async (parent, args, ctx): Promise<ResolversTypes['QuoteConnection']> => {
    if (!parent.id) {
      throw new GraphQLError('missing wallet address id', {
        extensions: {
          code: GraphQLErrorCode.BadUserInput
        }
      })
    }
    const quoteService = await ctx.container.use('quoteService')
    const { sortOrder, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
    const quotes = await quoteService.getWalletAddressPage({
      walletAddressId: parent.id,
      pagination,
      sortOrder: order
    })
    const pageInfo = await getPageInfo({
      getPage: (pagination: Pagination, sortOrder?: SortOrder) =>
        quoteService.getWalletAddressPage({
          walletAddressId: parent.id as string,
          pagination,
          sortOrder
        }),
      page: quotes,
      sortOrder: order
    })
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
    createdAt: new Date(+quote.createdAt).toISOString(),
    expiresAt: new Date(+quote.expiresAt).toISOString(),
    estimatedExchangeRate: quote.estimatedExchangeRate?.valueOf()
  }
}
