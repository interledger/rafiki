import { GraphQLError } from 'graphql'

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
import { Pagination, SortOrder } from '../../shared/baseModel'
import { WalletAddressAdditionalProperty } from '../../open_payments/wallet_address/additional_property/model'
import {
  CreateOptions,
  UpdateOptions
} from '../../open_payments/wallet_address/service'

// TODO: access control. need to add tenantId to getPage
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
    if (
      !walletAddress ||
      !(await walletAddressService.canAccess(
        ctx.isOperator,
        ctx.tenantId,
        walletAddress
      ))
    ) {
      throw new GraphQLError(
        errorToMessage[WalletAddressError.UnknownWalletAddress],
        {
          extensions: {
            code: errorToCode[WalletAddressError.UnknownWalletAddress]
          }
        }
      )
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
    const addProps: WalletAddressAdditionalProperty[] = []
    if (args.input.additionalProperties)
      args.input.additionalProperties.forEach((inputAddProp) => {
        const toAdd = new WalletAddressAdditionalProperty()
        toAdd.fieldKey = inputAddProp.key
        toAdd.fieldValue = inputAddProp.value
        toAdd.visibleInOpenPayments = inputAddProp.visibleInOpenPayments
        addProps.push(toAdd)
      })

    const options: CreateOptions = {
      assetId: args.input.assetId,
      additionalProperties: addProps,
      publicName: args.input.publicName,
      url: args.input.url,
      tenantId: args.input.tenantId
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

export const updateWalletAddress: MutationResolvers<ApolloContext>['updateWalletAddress'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['UpdateWalletAddressMutationResponse']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')

    const canAccess = await walletAddressService.canAccess(
      ctx.isOperator,
      ctx.tenantId,
      args.input.id
    )

    if (!canAccess) {
      throw new GraphQLError(
        errorToMessage[WalletAddressError.UnknownWalletAddress],
        {
          extensions: {
            code: errorToCode[WalletAddressError.UnknownWalletAddress]
          }
        }
      )
    }

    const { additionalProperties, ...rest } = args.input
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

// TODO: access control? operator only, anyone, or tenanted?
// Perhaps operator only? if tenanted will maybe need to fn
// like existing processNextWalletAddresses that filters by tenant
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
