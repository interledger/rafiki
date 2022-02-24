import {
  QueryResolvers,
  ResolversTypes,
  Asset as SchemaAsset,
  AssetEdge,
  MutationResolvers,
  AssetsConnectionResolvers
} from '../generated/graphql'
import { Asset } from '../../asset/model'
import { AssetService } from '../../asset/service'
import { AssetError, isAssetError } from '../../asset/errors'
import { ApolloContext } from '../../app'

export const getAssets: QueryResolvers<ApolloContext>['assets'] = async (
  parent,
  args,
  ctx
): ResolversTypes['AssetsConnection'] => {
  const assetService = await ctx.container.use('assetService')
  const assets = await assetService.getPage(args)
  return {
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
): ResolversTypes['Asset'] => {
  const assetService = await ctx.container.use('assetService')
  const asset = await assetService.getById(args.id)
  if (!asset) {
    throw new Error('No asset')
  }
  return assetToGraphql(asset)
}

export const createAsset: MutationResolvers<ApolloContext>['createAsset'] = async (
  parent,
  args,
  ctx
): ResolversTypes['AssetMutationResponse'] => {
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

export const updateAssetWithdrawalThreshold: MutationResolvers<ApolloContext>['updateAssetWithdrawalThreshold'] = async (
  parent,
  args,
  ctx
): ResolversTypes['AssetMutationResponse'] => {
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
    return {
      code: '200',
      success: true,
      message: 'Updated Asset Withdrawal Threshold',
      asset: assetToGraphql(assetOrError)
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

export const getAssetsConnectionPageInfo: AssetsConnectionResolvers<ApolloContext>['pageInfo'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PageInfo'] => {
  const edges = parent.edges
  if (edges == null || typeof edges == 'undefined' || edges.length == 0)
    return {
      hasPreviousPage: false,
      hasNextPage: false
    }
  return getPageInfo({
    assetService: await ctx.container.use('assetService'),
    edges
  })
}

const getPageInfo = async ({
  assetService,
  edges
}: {
  assetService: AssetService
  edges: AssetEdge[]
}): ResolversTypes['PageInfo'] => {
  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  let hasNextPageAssets, hasPreviousPageAssets
  try {
    hasNextPageAssets = await assetService.getPage({
      after: lastEdge,
      first: 1
    })
  } catch (e) {
    hasNextPageAssets = []
  }
  try {
    hasPreviousPageAssets = await assetService.getPage({
      before: firstEdge,
      last: 1
    })
  } catch (e) {
    hasPreviousPageAssets = []
  }

  return {
    endCursor: lastEdge,
    hasNextPage: hasNextPageAssets.length == 1,
    hasPreviousPage: hasPreviousPageAssets.length == 1,
    startCursor: firstEdge
  }
}

export const assetToGraphql = (asset: Asset): SchemaAsset => ({
  id: asset.id,
  code: asset.code,
  scale: asset.scale,
  withdrawalThreshold: asset.withdrawalThreshold ?? undefined,
  createdAt: new Date(+asset.createdAt).toISOString()
})
