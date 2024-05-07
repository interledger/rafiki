import {
  QueryResolvers,
  ResolversTypes,
  Asset as SchemaAsset,
  MutationResolvers,
  AssetResolvers
} from '../generated/graphql'
import { Asset } from '../../asset/model'
import {
  AssetError,
  isAssetError,
  errorToCode,
  errorToMessage
} from '../../asset/errors'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { feeToGraphql } from './fee'
import { Fee, FeeType } from '../../fee/model'

export const getAssets: QueryResolvers<ApolloContext>['assets'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['AssetsConnection']> => {
  const assetService = await ctx.container.use('assetService')
  const { sortOrder, ...pagination } = args
  const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
  const assets = await assetService.getPage(pagination, order)
  const pageInfo = await getPageInfo({
    getPage: (pagination: Pagination, sortOrder?: SortOrder) =>
      assetService.getPage(pagination, sortOrder),
    page: assets,
    sortOrder: order
  })
  return {
    pageInfo,
    edges: assets.map((asset: Asset) => ({
      cursor: asset.id,
      node: assetToGraphql(asset)
    }))
  }
}

export const getAsset: QueryResolvers<ApolloContext>['asset'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['Asset']> => {
  const assetService = await ctx.container.use('assetService')
  const asset = await assetService.get(args.id)
  if (!asset) {
    throw new Error('No asset')
  }
  return assetToGraphql(asset)
}

export const createAsset: MutationResolvers<ApolloContext>['createAsset'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['AssetMutationResponse']> => {
    try {
      const assetService = await ctx.container.use('assetService')
      const assetOrError = await assetService.create(args.input)
      if (isAssetError(assetOrError)) {
        switch (assetOrError) {
          case AssetError.DuplicateAsset:
            return {
              code: '409',
              message: 'Asset already exists',
              success: false
            }
          default:
            throw new Error(`AssetError: ${assetOrError}`)
        }
      }
      return {
        code: '200',
        success: true,
        message: 'Created Asset',
        asset: assetToGraphql(assetOrError)
      }
    } catch (err) {
      ctx.logger.error(
        {
          options: args.input,
          err
        },
        'error creating asset'
      )
      return {
        code: '500',
        message: 'Error trying to create asset',
        success: false
      }
    }
  }

export const updateAsset: MutationResolvers<ApolloContext>['updateAsset'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['AssetMutationResponse']> => {
    try {
      const assetService = await ctx.container.use('assetService')
      const assetOrError = await assetService.update({
        id: args.input.id,
        withdrawalThreshold: args.input.withdrawalThreshold ?? null,
        liquidityThreshold: args.input.liquidityThreshold ?? null
      })
      if (isAssetError(assetOrError)) {
        switch (assetOrError) {
          case AssetError.UnknownAsset:
            return {
              code: '404',
              message: 'Unknown asset',
              success: false
            }
          default:
            throw new Error(`AssetError: ${assetOrError}`)
        }
      }
      return {
        code: '200',
        success: true,
        message: 'Updated Asset',
        asset: assetToGraphql(assetOrError)
      }
    } catch (err) {
      ctx.logger.error(
        {
          options: args.input,
          err
        },
        'error updating asset'
      )
      return {
        code: '400',
        message: 'Error trying to update asset',
        success: false
      }
    }
  }

export const getAssetSendingFee: AssetResolvers<ApolloContext>['sendingFee'] =
  async (parent, args, ctx): Promise<ResolversTypes['Fee'] | null> => {
    if (!parent.id) return null

    const feeService = await ctx.container.use('feeService')
    const fee = await feeService.getLatestFee(parent.id, FeeType.Sending)

    if (!fee) return null

    return feeToGraphql(fee)
  }

export const getAssetReceivingFee: AssetResolvers<ApolloContext>['receivingFee'] =
  async (parent, args, ctx): Promise<ResolversTypes['Fee'] | null> => {
    if (!parent.id) return null

    const feeService = await ctx.container.use('feeService')
    const fee = await feeService.getLatestFee(parent.id, FeeType.Receiving)

    if (!fee) return null

    return feeToGraphql(fee)
  }

export const getFees: AssetResolvers<ApolloContext>['fees'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['FeesConnection']> => {
  const { sortOrder, ...pagination } = args
  const feeService = await ctx.container.use('feeService')
  const getPageFn = (pagination_: Pagination, sortOrder_?: SortOrder) => {
    if (!parent.id) throw new Error('missing asset id')
    return feeService.getPage(parent.id, pagination_, sortOrder_)
  }
  const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
  const fees = await getPageFn(pagination, order)
  const pageInfo = await getPageInfo({
    getPage: (pagination_: Pagination, sortOrder_?: SortOrder) =>
      getPageFn(pagination_, sortOrder_),
    page: fees,
    sortOrder
  })
  return {
    pageInfo,
    edges: fees.map((fee: Fee) => ({
      cursor: fee.id,
      node: feeToGraphql(fee)
    }))
  }
}

export const deleteAsset: MutationResolvers<ApolloContext>['deleteAsset'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['DeleteAssetMutationResponse']> => {
    try {
      const assetService = await ctx.container.use('assetService')
      const assetOrError = await assetService.delete({
        id: args.input.id,
        deletedAt: new Date().toISOString()
      })

      if (isAssetError(assetOrError)) {
        switch (assetOrError) {
          case AssetError.UnknownAsset:
            return {
              code: errorToCode[AssetError.UnknownAsset].toString(),
              message: errorToMessage[AssetError.UnknownAsset],
              success: false
            }
          case AssetError.InuseAsset:
            return {
              code: errorToCode[AssetError.InuseAsset].toString(),
              message: errorToMessage[AssetError.InuseAsset],
              success: false
            }
          default:
            throw new Error(`AssetError: ${assetOrError}`)
        }
      }
      return {
        code: '200',
        success: true,
        message: 'Asset deleted'
      }
    } catch (err) {
      ctx.logger.error(
        {
          id: args.input.id,
          err
        },
        'error deleting asset'
      )
      return {
        code: '500',
        message: 'Error trying to delete asset',
        success: false
      }
    }
  }

export const assetToGraphql = (asset: Asset): SchemaAsset => ({
  id: asset.id,
  code: asset.code,
  scale: asset.scale,
  withdrawalThreshold: asset.withdrawalThreshold,
  liquidityThreshold: asset.liquidityThreshold,
  createdAt: new Date(+asset.createdAt).toISOString()
})
