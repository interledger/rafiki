import { assetToGraphql } from './asset'
import {
  QueryResolvers,
  ResolversTypes,
  Peer as SchemaPeer,
  MutationResolvers
} from '../generated/graphql'
import { Peer } from '../../payment-method/ilp/peer/model'
import {
  PeerError,
  isPeerError,
  errorToCode,
  errorToMessage
} from '../../payment-method/ilp/peer/errors'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination, SortOrder } from '../../shared/baseModel'

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
    throw new Error('No peer')
  }
  return peerToGraphql(peer)
}

export const createPeer: MutationResolvers<ApolloContext>['createPeer'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreatePeerMutationResponse']> => {
    const peerService = await ctx.container.use('peerService')
    return peerService
      .create(args.input)
      .then((peerOrError: Peer | PeerError) =>
        isPeerError(peerOrError)
          ? {
              code: errorToCode[peerOrError].toString(),
              success: false,
              message: errorToMessage[peerOrError]
            }
          : {
              code: '200',
              success: true,
              message: 'Created ILP Peer',
              peer: peerToGraphql(peerOrError)
            }
      )
      .catch((err) => {
        ctx.logger.error(
          {
            options: args.input,
            err
          },
          'error creating peer'
        )
        return {
          code: '500',
          success: false,
          message: 'Error trying to create peer'
        }
      })
  }

export const updatePeer: MutationResolvers<ApolloContext>['updatePeer'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['UpdatePeerMutationResponse']> => {
    const peerService = await ctx.container.use('peerService')
    return peerService
      .update(args.input)
      .then((peerOrError: Peer | PeerError) =>
        isPeerError(peerOrError)
          ? {
              code: errorToCode[peerOrError].toString(),
              success: false,
              message: errorToMessage[peerOrError]
            }
          : {
              code: '200',
              success: true,
              message: 'Updated ILP Peer',
              peer: peerToGraphql(peerOrError)
            }
      )
      .catch((err) => {
        ctx.logger.error(
          {
            options: args.input,
            err
          },
          'error updating peer'
        )
        return {
          code: '500',
          message: 'Error trying to update peer',
          success: false
        }
      })
  }

export const deletePeer: MutationResolvers<ApolloContext>['deletePeer'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['DeletePeerMutationResponse']> => {
    const peerService = await ctx.container.use('peerService')
    return peerService
      .delete(args.input.id)
      .then((peer: Peer | undefined) =>
        peer
          ? {
              code: '200',
              success: true,
              message: 'Deleted ILP Peer'
            }
          : {
              code: errorToCode[PeerError.UnknownPeer].toString(),
              success: false,
              message: errorToMessage[PeerError.UnknownPeer]
            }
      )
      .catch((err) => {
        ctx.logger.error(
          {
            id: args.input.id,
            err
          },
          'error deleting peer'
        )
        return {
          code: '500',
          message: 'Error trying to delete peer',
          success: false
        }
      })
  }

export const peerToGraphql = (peer: Peer): SchemaPeer => ({
  id: peer.id,
  maxPacketAmount: peer.maxPacketAmount,
  http: peer.http,
  asset: assetToGraphql(peer.asset),
  staticIlpAddress: peer.staticIlpAddress,
  name: peer.name,
  liquidityThreshold: peer.liquidityThreshold,
  createdAt: new Date(+peer.createdAt).toISOString()
})
