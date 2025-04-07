import { GraphQLError } from 'graphql'

import { assetToGraphql } from './asset'
import {
  QueryResolvers,
  ResolversTypes,
  WalletAddress as SchemaWalletAddress,
  MutationResolvers,
  WalletAddressStatus
} from '../generated/graphql'
import { ForTenantIdContext, TenantedApolloContext } from '../../app'
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
import { GraphQLErrorCode } from '../errors'

export const getWalletAddresses: QueryResolvers<TenantedApolloContext>['walletAddresses'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WalletAddressesConnection']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const { tenantId, sortOrder, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc

    const walletAddresses = await walletAddressService.getPage(
      pagination,
      order,
      ctx.isOperator ? tenantId : ctx.tenant.id
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

export const getWalletAddress: QueryResolvers<TenantedApolloContext>['walletAddress'] =
  async (parent, args, ctx): Promise<ResolversTypes['WalletAddress']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const walletAddress = await walletAddressService.get(
      args.id,
      ctx.isOperator ? undefined : ctx.tenant.id
    )
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
    return walletAddressToGraphql(walletAddress)
  }

export const getWalletAddressByUrl: QueryResolvers<TenantedApolloContext>['walletAddressByUrl'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WalletAddress'] | null> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const walletAddress = await walletAddressService.getByUrl(
      args.url,
      ctx.isOperator ? undefined : ctx.tenant.id
    )
    return walletAddress ? walletAddressToGraphql(walletAddress) : null
  }

export const createWalletAddress: MutationResolvers<ForTenantIdContext>['createWalletAddress'] =
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

    const tenantId = ctx.forTenantId

    if (!tenantId)
      throw new GraphQLError(
        `Assignment to the specified tenant is not permitted`,
        {
          extensions: {
            code: GraphQLErrorCode.BadUserInput
          }
        }
      )

    const options: CreateOptions = {
      assetId: args.input.assetId,
      tenantId,
      additionalProperties: addProps,
      publicName: args.input.publicName,
      address: args.input.address,
      isOperator: ctx.isOperator
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

export const updateWalletAddress: MutationResolvers<ForTenantIdContext>['updateWalletAddress'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['UpdateWalletAddressMutationResponse']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const { additionalProperties, ...rest } = args.input

    const updateOptions: UpdateOptions = {
      ...rest
    }

    const existing = await walletAddressService.get(
      updateOptions.id,
      ctx.forTenantId
    )
    if (!existing) {
      throw new GraphQLError(`Unknown wallet address`, {
        extensions: {
          code: GraphQLErrorCode.NotFound
        }
      })
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
  walletAddress: WalletAddress
): SchemaWalletAddress {
  return {
    id: walletAddress.id,
    address: walletAddress.address,
    asset: assetToGraphql(walletAddress.asset),
    publicName: walletAddress.publicName ?? undefined,
    createdAt: new Date(+walletAddress.createdAt).toISOString(),
    status: walletAddress.isActive
      ? WalletAddressStatus.Active
      : WalletAddressStatus.Inactive,
    tenantId: walletAddress.tenantId
  }
}
