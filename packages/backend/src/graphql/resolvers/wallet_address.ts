import { GraphQLError } from 'graphql'

import { assetToGraphql } from './asset'
import {
  QueryResolvers,
  ResolversTypes,
  WalletAddress as SchemaWalletAddress,
  MutationResolvers,
  WalletAddressStatus
} from '../generated/graphql'
import { TenantedApolloContext } from '../../app'
import {
  WalletAddressError,
  isWalletAddressError,
  errorToCode,
  errorToMessage
} from '../../open_payments/wallet_address/errors'
import { WalletAddress } from '../../open_payments/wallet_address/model'
import { getPageInfo } from '../../shared/pagination'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { WalletAddressAdditionalProperty } from '../../open_payments/wallet_address/additional_property/model'
import {
  CreateOptions,
  UpdateOptions
} from '../../open_payments/wallet_address/service'
import { tenantIdToUseAndValidate } from '../../shared/utils'

export const getWalletAddresses: QueryResolvers<TenantedApolloContext>['walletAddresses'] =
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
        node: walletAddressToGraphql(walletAddress, ctx)
      }))
    }
  }

export const getWalletAddress: QueryResolvers<TenantedApolloContext>['walletAddress'] =
  async (parent, args, ctx): Promise<ResolversTypes['WalletAddress']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const walletAddress = await walletAddressService.get(args.id)
    if (!walletAddress) {
      throw new GraphQLError(
        errorToMessage[WalletAddressError.UnknownWalletAddress],
        {
          extensions: {
            code: errorToCode[WalletAddressError.UnknownWalletAddress]
          }
        }
      )
    }
    return walletAddressToGraphql(walletAddress, ctx)
  }

export const getWalletAddressByUrl: QueryResolvers<TenantedApolloContext>['walletAddressByUrl'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WalletAddress'] | null> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const walletAddress = await walletAddressService.getByUrl(args.url)
    return walletAddress ? walletAddressToGraphql(walletAddress, ctx) : null
  }

export const createWalletAddress: MutationResolvers<TenantedApolloContext>['createWalletAddress'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreateWalletAddressMutationResponse']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const addProps: WalletAddressAdditionalProperty[] = []
    if (args.input.additionalProperties)
      args.input.additionalProperties.forEach((inputAddProp) => {
        const toAdd = new WalletAddressAdditionalProperty()
        toAdd.fieldKey = inputAddProp.key
        toAdd.fieldValue = inputAddProp.value
        toAdd.visibleInOpenPayments = inputAddProp.visibleInOpenPayments
        addProps.push(toAdd)
      })

    const tenantId = tenantIdToUseAndValidate(ctx, args.input.tenantId)
    const options: CreateOptions = {
      assetId: args.input.assetId,
      tenantId,
      additionalProperties: addProps,
      publicName: args.input.publicName,
      url: args.input.url
    }

    const walletAddressOrError = await walletAddressService.create(options)
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

export const updateWalletAddress: MutationResolvers<TenantedApolloContext>['updateWalletAddress'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['UpdateWalletAddressMutationResponse']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const { additionalProperties, ...rest } = args.input

    tenantIdToUseAndValidate(ctx, args.input.tenantId)

    const updateOptions: UpdateOptions = {
      ...rest
    }
    if (additionalProperties) {
      updateOptions.additionalProperties = additionalProperties.map(
        (property) => {
          return {
            fieldKey: property.key,
            fieldValue: property.value,
            visibleInOpenPayments: property.visibleInOpenPayments
          }
        }
      )
    }
    const walletAddressOrError =
      await walletAddressService.update(updateOptions)
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

export const triggerWalletAddressEvents: MutationResolvers<TenantedApolloContext>['triggerWalletAddressEvents'] =
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

export function walletAddressToGraphql(
  walletAddress: WalletAddress,
  ctx?: TenantedApolloContext
): SchemaWalletAddress {
  if (ctx) tenantIdToUseAndValidate(ctx, walletAddress.tenantId)

  return {
    id: walletAddress.id,
    url: walletAddress.url,
    asset: assetToGraphql(walletAddress.asset),
    publicName: walletAddress.publicName ?? undefined,
    createdAt: new Date(+walletAddress.createdAt).toISOString(),
    status: walletAddress.isActive
      ? WalletAddressStatus.Active
      : WalletAddressStatus.Inactive
  }
}
