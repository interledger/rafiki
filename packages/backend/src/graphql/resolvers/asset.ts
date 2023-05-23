import {
  QueryResolvers,
  ResolversTypes,
  Asset as SchemaAsset,
  MutationResolvers
} from '../generated/graphql'
import { Asset } from '../../asset/model'
import { AssetError, isAssetError } from '../../asset/errors'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'

export const getAssets: QueryResolvers<ApolloContext>['assets'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['AssetsConnection']> => {
  const assetService = await ctx.container.use('assetService')
  const assets = await assetService.getPage(args)
  const pageInfo = await getPageInfo(
    (pagination: Pagination) => assetService.getPage(pagination),
    assets
  )
  return {
    pageInfo,
    edges: await Promise.all(
      assets.map(async (asset: Asset) => {
        const balance = await getBalance(ctx, asset.id)
        return {
          cursor: asset.id,
          node: assetToGraphql(asset, balance)
        }
      })
    )
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
  const balance = await getBalance(ctx, args.id)
  return assetToGraphql(asset, balance)
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
        asset: assetToGraphql(assetOrError, BigInt(0))
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input,
          error
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

export const updateAssetWithdrawalThreshold: MutationResolvers<ApolloContext>['updateAssetWithdrawalThreshold'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['AssetMutationResponse']> => {
    try {
      const assetService = await ctx.container.use('assetService')
      const assetOrError = await assetService.update({
        id: args.input.id,
        withdrawalThreshold: args.input.withdrawalThreshold ?? null
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
      const balance = await getBalance(ctx, assetOrError.id)
      return {
        code: '200',
        success: true,
        message: 'Updated Asset Withdrawal Threshold',
        asset: assetToGraphql(assetOrError, balance)
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input,
          error
        },
        'error updating asset'
      )
      return {
        code: '400',
        message: 'Error trying to update asset withdrawal threshold',
        success: false
      }
    }
  }

export const getBalance = async (
  ctx: ApolloContext,
  id: string
): Promise<bigint> => {
  const accountingService = await ctx.container.use('accountingService')
  const balance = await accountingService.getBalance(id)
  if (balance === undefined) {
    throw new Error('No liquidity account found')
  }
  return balance
}

export const assetToGraphql = (
  asset: Asset,
  balance?: bigint
): SchemaAsset => ({
  id: asset.id,
  code: asset.code,
  scale: asset.scale,
  liquidity: balance,
  withdrawalThreshold: asset.withdrawalThreshold,
  createdAt: new Date(+asset.createdAt).toISOString()
})
