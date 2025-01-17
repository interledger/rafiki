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
import { tenantIdToProceed } from '../../shared/utils'
import { GraphQLErrorCode } from '../errors'

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
      edges: walletAddresses
        .filter(
          (wa: WalletAddress) =>
            tenantIdToProceed(ctx.isOperator, ctx.tenant.id, wa.tenantId) !=
            undefined
        )
        .map((walletAddress: WalletAddress) => ({
          cursor: walletAddress.id,
          node: walletAddressToGraphql(walletAddress)
        }))
    }
  }

export const getWalletAddress: QueryResolvers<TenantedApolloContext>['walletAddress'] =
  async (parent, args, ctx): Promise<ResolversTypes['WalletAddress']> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const walletAddress = await walletAddressService.get(args.id)
    if (
      !walletAddress ||
      !tenantIdToProceed(ctx.isOperator, ctx.tenant.id, walletAddress.tenantId)
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

export const getWalletAddressByUrl: QueryResolvers<TenantedApolloContext>['walletAddressByUrl'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WalletAddress'] | null> => {
    const walletAddressService = await ctx.container.use('walletAddressService')
    const walletAddress = await walletAddressService.getByUrl(args.url)
    return walletAddress &&
      tenantIdToProceed(ctx.isOperator, ctx.tenant.id, walletAddress.tenantId)
      ? walletAddressToGraphql(walletAddress)
      : null
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

    const options: CreateOptions = {
      assetId: args.input.assetId,
      // We always have a tenant for [TenantedApolloContext].
      tenantId: ctx.forTenantId,
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

    const updateOptions: UpdateOptions = {
      ...rest
    }

    const existing = await walletAddressService.get(updateOptions.id)
    if (
      existing &&
      !tenantIdToProceed(ctx.isOperator, ctx.forTenantId, existing.tenantId)
    ) {
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
    url: walletAddress.url,
    asset: assetToGraphql(walletAddress.asset),
    publicName: walletAddress.publicName ?? undefined,
    createdAt: new Date(+walletAddress.createdAt).toISOString(),
    status: walletAddress.isActive
      ? WalletAddressStatus.Active
      : WalletAddressStatus.Inactive
  }
}
