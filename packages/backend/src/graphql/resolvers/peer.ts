import { assetToGraphql } from './asset'
import {
  QueryResolvers,
  ResolversTypes,
  Peer as SchemaPeer,
  MutationResolvers
} from '../generated/graphql'
import { Peer } from '../../peer/model'
import { PeerError, isPeerError } from '../../peer/errors'
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
    try {
      const peerService = await ctx.container.use('peerService')
      const peerOrError = await peerService.create(args.input)
      if (isPeerError(peerOrError)) {
        switch (peerOrError) {
          case PeerError.DuplicateIncomingToken:
            return {
              code: '409',
              message: 'Incoming token already exists',
              success: false
            }
          case PeerError.InvalidStaticIlpAddress:
            return {
              code: '400',
              message: 'Invalid ILP address',
              success: false
            }
          default:
            throw new Error(`PeerError: ${peerOrError}`)
        }
      }
      return {
        code: '200',
        success: true,
        message: 'Created ILP Peer',
        peer: peerToGraphql(peerOrError)
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input,
          error
        },
        'error creating peer'
      )
      return {
        code: '500',
        message: 'Error trying to create peer',
        success: false
      }
    }
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
        switch (peerOrError) {
          case PeerError.UnknownPeer:
            return {
              code: '404',
              message: 'Unknown peer',
              success: false
            }
          case PeerError.DuplicateIncomingToken:
            return {
              code: '409',
              message: 'Incoming token already exists',
              success: false
            }
          default:
            throw new Error(`PeerError: ${peerOrError}`)
        }
      }
      return {
        code: '200',
        success: true,
        message: 'Updated ILP Peer',
        peer: peerToGraphql(peerOrError)
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
        code: '400',
        message: 'Error trying to update peer',
        success: false
      }
    }
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
  createdAt: new Date(+peer.createdAt).toISOString()
})
