import { assetToGraphql, getBalance } from './asset'
import {
  QueryResolvers,
  ResolversTypes,
  Peer as SchemaPeer,
  MutationResolvers
} from '../generated/graphql'
import { Peer } from '../../peer/model'
import {
  PeerError,
  isPeerError,
  errorToCode,
  errorToMessage
} from '../../peer/errors'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'

export const getPeers: QueryResolvers<ApolloContext>['peers'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['PeersConnection']> => {
  const peerService = await ctx.container.use('peerService')
  const peers = await peerService.getPage(args)
  const pageInfo = await getPageInfo(
    (pagination: Pagination) => peerService.getPage(pagination),
    peers
  )
  return {
    pageInfo,
    edges: await Promise.all(
      peers.map(async (peer: Peer) => {
        const balance = await getBalance(ctx, peer.id)
        return {
          cursor: peer.id,
          node: peerToGraphql(peer, balance)
        }
      })
    )
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
  const balance = await getBalance(ctx, args.id)
  return peerToGraphql(peer, balance)
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
              peer: peerToGraphql(peerOrError, BigInt(0))
            }
      )
      .catch((error) => {
        ctx.logger.error(
          {
            options: args.input,
            error
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
    try {
      const peerService = await ctx.container.use('peerService')
      const peerOrError = await peerService.update(args.input)
      if (isPeerError(peerOrError)) {
        return {
          code: errorToCode[peerOrError].toString(),
          success: false,
          message: errorToMessage[peerOrError]
        }
      }
      const balance = await getBalance(ctx, peerOrError.id)
      return {
        code: '200',
        success: true,
        message: 'Updated ILP Peer',
        peer: peerToGraphql(peerOrError, balance)
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input,
          error
        },
        'error updating peer'
      )
      return {
        code: '500',
        message: 'Error trying to update peer',
        success: false
      }
    }
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
      .catch((error) => {
        ctx.logger.error(
          {
            id: args.input.id,
            error
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

export const peerToGraphql = (peer: Peer, balance?: bigint): SchemaPeer => ({
  id: peer.id,
  maxPacketAmount: peer.maxPacketAmount,
  http: peer.http,
  asset: assetToGraphql(peer.asset),
  staticIlpAddress: peer.staticIlpAddress,
  name: peer.name,
  liquidity: balance,
  createdAt: new Date(+peer.createdAt).toISOString()
})
