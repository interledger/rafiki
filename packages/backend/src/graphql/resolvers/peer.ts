import { assetToGraphql } from './asset'
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
      .catch((error) => {
        ctx.logger.error(
          {
            options: args.input,
            error
          },
          'error updating peer'
        )
        return {
          code: '400',
          message: 'Error trying to update peer',
          success: false
        }
      })
  }

export const deletePeer: MutationResolvers<ApolloContext>['deletePeer'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['DeletePeerMutationResponse']> => {
    // TODO:
    console.log(ctx) // temporary to pass linting
    return {}
  }

export const peerToGraphql = (peer: Peer): SchemaPeer => ({
  id: peer.id,
  maxPacketAmount: peer.maxPacketAmount,
  http: peer.http,
  asset: assetToGraphql(peer.asset),
  staticIlpAddress: peer.staticIlpAddress,
  name: peer.name,
  createdAt: new Date(+peer.createdAt).toISOString()
})
