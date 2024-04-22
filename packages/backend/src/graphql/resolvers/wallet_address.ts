import { assetToGraphql } from './asset'
import {
  QueryResolvers,
  ResolversTypes,
  WalletAddress as SchemaWalletAddress,
  MutationResolvers,
  WalletAddressStatus
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import {
  isWalletAddressError,
  errorToCode,
  errorToMessage
} from '../../open_payments/wallet_address/errors'
import { WalletAddress } from '../../open_payments/wallet_address/model'
import { getPageInfo } from '../../shared/pagination'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { GraphQLError } from 'graphql'
import { GraphQLErrorCode } from '../errors'

export const getWalletAddresses: QueryResolvers<ApolloContext>['walletAddresses'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WalletAddressesConnection']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const { sortOrder, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
    const walletAddresses = await walletAddressService.getPage(
      pagination,
      order
    )
    const pageInfo = await getPageInfo({
      getPage: (pagination: Pagination, sortOrder?: SortOrder) =>
        walletAddressService.getPage(pagination, sortOrder),
      page: walletAddresses,
      sortOrder: order
    })
    return {
      pageInfo,
      edges: walletAddresses.map((walletAddress: WalletAddress) => ({
        cursor: walletAddress.id,
        node: walletAddressToGraphql(walletAddress)
      }))
    }
  }

export const getWalletAddress: QueryResolvers<ApolloContext>['walletAddress'] =
  async (parent, args, ctx): Promise<ResolversTypes['WalletAddress']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const walletAddress = await walletAddressService.get(args.id)
    if (!walletAddress) {
      throw new GraphQLError('Wallet address not found', {
        extensions: {
          code: GraphQLErrorCode.NotFound
        }
      })
    }
    return walletAddressToGraphql(walletAddress)
  }

export const createWalletAddress: MutationResolvers<ApolloContext>['createWalletAddress'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreateWalletAddressMutationResponse']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const walletAddressOrError = await walletAddressService.create(args.input)
    if (isWalletAddressError(walletAddressOrError)) {
      throw new GraphQLError(errorToMessage[walletAddressOrError], {
        extensions: {
          code: errorToCode[walletAddressOrError]
        }
      })
    }
    return {
      walletAddress: walletAddressToGraphql(walletAddressOrError)
    }
  }

export const updateWalletAddress: MutationResolvers<ApolloContext>['updateWalletAddress'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['UpdateWalletAddressMutationResponse']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const walletAddressOrError = await walletAddressService.update(args.input)
    if (isWalletAddressError(walletAddressOrError)) {
      throw new GraphQLError(errorToMessage[walletAddressOrError], {
        extensions: {
          code: errorToCode[walletAddressOrError]
        }
      })
    }
    return {
      walletAddress: walletAddressToGraphql(walletAddressOrError)
    }
  }

export const triggerWalletAddressEvents: MutationResolvers<ApolloContext>['triggerWalletAddressEvents'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['TriggerWalletAddressEventsMutationResponse']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const count = await walletAddressService.triggerEvents(args.input.limit)
    return {
      count
    }
  }

export const walletAddressToGraphql = (
  walletAddress: WalletAddress
): SchemaWalletAddress => ({
  id: walletAddress.id,
  url: walletAddress.url,
  asset: assetToGraphql(walletAddress.asset),
  publicName: walletAddress.publicName ?? undefined,
  createdAt: new Date(+walletAddress.createdAt).toISOString(),
  status: walletAddress.isActive
    ? WalletAddressStatus.Active
    : WalletAddressStatus.Inactive
})
