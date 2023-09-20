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
  WalletAddressError,
  isWalletAddressError,
  errorToCode,
  errorToMessage
} from '../../open_payments/wallet_address/errors'
import { WalletAddress } from '../../open_payments/wallet_address/model'
import { getPageInfo } from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'

export const getWalletAddresses: QueryResolvers<ApolloContext>['walletAddresses'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WalletAddressesConnection']> => {
    const walletAddressService = await ctx.container.use(
      'walletAddressService'
    )
    const walletAddresses = await walletAddressService.getPage(args)
    const pageInfo = await getPageInfo(
      (pagination: Pagination) => walletAddressService.getPage(pagination),
      walletAddresses
    )
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
    const walletAddressService = await ctx.container.use(
      'walletAddressService'
    )
    const walletAddress = await walletAddressService.get(args.id)
    if (!walletAddress) {
      throw new Error('No payment pointer')
    }
    return walletAddressToGraphql(walletAddress)
  }

export const createWalletAddress: MutationResolvers<ApolloContext>['createWalletAddress'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreateWalletAddressMutationResponse']> => {
    const walletAddressService = await ctx.container.use(
      'walletAddressService'
    )
    return walletAddressService
      .create(args.input)
      .then((walletAddressOrError: WalletAddress | WalletAddressError) =>
        isWalletAddressError(walletAddressOrError)
          ? {
              code: errorToCode[walletAddressOrError].toString(),
              success: false,
              message: errorToMessage[walletAddressOrError]
            }
          : {
              code: '200',
              success: true,
              message: 'Created payment pointer',
              walletAddress: walletAddressToGraphql(walletAddressOrError)
            }
      )
      .catch(() => ({
        code: '500',
        success: false,
        message: 'Error trying to create payment pointer'
      }))
  }
export const updateWalletAddress: MutationResolvers<ApolloContext>['updateWalletAddress'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['UpdateWalletAddressMutationResponse']> => {
    const walletAddressService = await ctx.container.use(
      'walletAddressService'
    )
    return walletAddressService
      .update(args.input)
      .then((walletAddressOrError: WalletAddress | WalletAddressError) =>
        isWalletAddressError(walletAddressOrError)
          ? {
              code: errorToCode[walletAddressOrError].toString(),
              success: false,
              message: errorToMessage[walletAddressOrError]
            }
          : {
              code: '200',
              success: true,
              message: 'Updated payment pointer',
              walletAddress: walletAddressToGraphql(walletAddressOrError)
            }
      )
      .catch(() => ({
        code: '500',
        success: false,
        message: 'Error trying to update payment pointer'
      }))
  }

export const triggerWalletAddressEvents: MutationResolvers<ApolloContext>['triggerWalletAddressEvents'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['TriggerWalletAddressEventsMutationResponse']> => {
    try {
      const walletAddressService = await ctx.container.use(
        'walletAddressService'
      )
      const count = await walletAddressService.triggerEvents(args.input.limit)
      return {
        code: '200',
        success: true,
        message: 'Triggered Payment Pointer Events',
        count
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input.limit,
          error
        },
        'error triggering payment pointer events'
      )
      return {
        code: '500',
        message: 'Error trying to trigger payment pointer events',
        success: false
      }
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
