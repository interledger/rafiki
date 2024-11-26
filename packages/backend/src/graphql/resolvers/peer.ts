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
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { GraphQLError } from 'graphql'

export const getPeers: QueryResolvers<ApolloContext>['peers'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['PeersConnection']> => {
  const peerService = await ctx.container.use('peerService')
  const { sortOrder, ...pagination } = args
  const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
  const peers = await peerService.getPage(pagination, order)
  const pageInfo = await getPageInfo({
    getPage: (pagination: Pagination, sortOrder?: SortOrder) =>
      peerService.getPage(pagination, sortOrder),
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

export const getPeer: QueryResolvers<ApolloContext>['peer'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['Peer']> => {
  const peerService = await ctx.container.use('peerService')
  const peer = await peerService.get(args.id)
  if (!peer) {
    throw new GraphQLError(errorToMessage[PeerError.UnknownPeer], {
      extensions: {
        code: errorToCode[PeerError.UnknownPeer]
      }
    })
  }
  return peerToGraphql(peer)
}

export const getPeerByAddressAndAsset: QueryResolvers<ApolloContext>['peerByAddressAndAsset'] =
  async (parent, args, ctx): Promise<ResolversTypes['Peer'] | null> => {
    const peerService = await ctx.container.use('peerService')
    const peer = await peerService.getByDestinationAddress(
      args.staticIlpAddress,
      args.assetId
    )
    return peer ? peerToGraphql(peer) : null
  }

export const createPeer: MutationResolvers<ApolloContext>['createPeer'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreatePeerMutationResponse']> => {
    const peerService = await ctx.container.use('peerService')
    const peerOrError = await peerService.create(args.input)
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

export const updatePeer: MutationResolvers<ApolloContext>['updatePeer'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['UpdatePeerMutationResponse']> => {
    const peerService = await ctx.container.use('peerService')
    const peerOrError = await peerService.update(args.input)
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

export const deletePeer: MutationResolvers<ApolloContext>['deletePeer'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['DeletePeerMutationResponse']> => {
    const peerService = await ctx.container.use('peerService')
    const peer = await peerService.delete(args.input.id)
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
  liquidityThresholdLow: peer.liquidityThresholdLow,
  liquidityThresholdHigh: peer.liquidityThresholdHigh,
  createdAt: new Date(+peer.createdAt).toISOString()
})
