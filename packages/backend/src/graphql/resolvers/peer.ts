import { assetToGraphql } from './asset'
import {
  QueryResolvers,
  ResolversTypes,
  Peer as SchemaPeer,
  MutationResolvers
} from '../generated/graphql'
import { Peer } from '../../payment-method/ilp/peer/model'
import {
  isPeerError,
  errorToCode,
  errorToMessage,
  PeerError
} from '../../payment-method/ilp/peer/errors'
import { TenantedApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { GraphQLError } from 'graphql'

export const getPeers: QueryResolvers<TenantedApolloContext>['peers'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['PeersConnection']> => {
  const peerService = await ctx.container.use('peerService')
  const { sortOrder, ...pagination } = args
  const tenantId = ctx.isOperator ? args.tenantId : ctx.tenant.id
  const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
  const peers = await peerService.getPage(pagination, order, tenantId)
  const pageInfo = await getPageInfo({
    getPage: (
      pagination: Pagination,
      sortOrder?: SortOrder,
      tenantId?: string
    ) => peerService.getPage(pagination, sortOrder, tenantId),
    page: peers,
    sortOrder: order
  })
  return {
    pageInfo,
    edges: peers.map((peer: Peer) => ({
      cursor: peer.id,
      node: peerToGraphql(peer)
    }))
  }
}

export const getPeer: QueryResolvers<TenantedApolloContext>['peer'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['Peer']> => {
  const peerService = await ctx.container.use('peerService')
  const peer = await peerService.get(
    args.id,
    ctx.isOperator ? undefined : ctx.tenant.id
  )
  if (!peer) {
    throw new GraphQLError(errorToMessage[PeerError.UnknownPeer], {
      extensions: {
        code: errorToCode[PeerError.UnknownPeer]
      }
    })
  }
  return peerToGraphql(peer)
}

export const getPeerByAddressAndAsset: QueryResolvers<TenantedApolloContext>['peerByAddressAndAsset'] =
  async (parent, args, ctx): Promise<ResolversTypes['Peer'] | null> => {
    const peerService = await ctx.container.use('peerService')
    const peer = await peerService.getByDestinationAddress(
      args.staticIlpAddress,
      ctx.tenant.id,
      args.assetId
    )
    return peer ? peerToGraphql(peer) : null
  }

export const createPeer: MutationResolvers<TenantedApolloContext>['createPeer'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreatePeerMutationResponse']> => {
    const peerService = await ctx.container.use('peerService')
    const peerOrError = await peerService.create({
      ...args.input,
      tenantId: ctx.isOperator ? undefined : ctx.tenant.id
    })
    if (isPeerError(peerOrError)) {
      throw new GraphQLError(errorToMessage[peerOrError], {
        extensions: {
          code: errorToCode[peerOrError]
        }
      })
    }
    return {
      peer: peerToGraphql(peerOrError)
    }
  }

export const updatePeer: MutationResolvers<TenantedApolloContext>['updatePeer'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['UpdatePeerMutationResponse']> => {
    const peerService = await ctx.container.use('peerService')
    const peerOrError = await peerService.update({
      ...args.input,
      tenantId: ctx.isOperator ? undefined : ctx.tenant.id
    })
    if (isPeerError(peerOrError)) {
      throw new GraphQLError(errorToMessage[peerOrError], {
        extensions: {
          code: errorToCode[peerOrError]
        }
      })
    }
    return {
      peer: peerToGraphql(peerOrError)
    }
  }

export const deletePeer: MutationResolvers<TenantedApolloContext>['deletePeer'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['DeletePeerMutationResponse']> => {
    const peerService = await ctx.container.use('peerService')
    const peer = await peerService.delete(args.input.id, ctx.tenant.id)
    if (!peer) {
      throw new GraphQLError(errorToMessage[PeerError.UnknownPeer], {
        extensions: {
          code: errorToCode[PeerError.UnknownPeer]
        }
      })
    }
    return {
      success: true
    }
  }

export const peerToGraphql = (peer: Peer): SchemaPeer => ({
  id: peer.id,
  maxPacketAmount: peer.maxPacketAmount,
  http: peer.http,
  asset: assetToGraphql(peer.asset),
  staticIlpAddress: peer.staticIlpAddress,
  name: peer.name,
  liquidityThreshold: peer.liquidityThreshold,
  createdAt: new Date(+peer.createdAt).toISOString(),
  tenantId: peer.tenantId
})
