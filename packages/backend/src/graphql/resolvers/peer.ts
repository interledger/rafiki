import {
  QueryResolvers,
  ResolversTypes,
  PeerEdge,
  MutationResolvers,
  PeersConnectionResolvers
} from '../generated/graphql'
import { Peer } from '../../peer/model'
import { PeerService } from '../../peer/service'
import { PeerError, isPeerError } from '../../peer/errors'
import { ApolloContext } from '../../app'

export const getPeers: QueryResolvers<ApolloContext>['peers'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PeersConnection'] => {
  const peerService = await ctx.container.use('peerService')
  const peers = await peerService.getPage(args)
  return {
    edges: peers.map((peer: Peer) => ({
      cursor: peer.id,
      node: peer
    }))
  }
}

export const getPeer: QueryResolvers<ApolloContext>['peer'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Peer'] => {
  const peerService = await ctx.container.use('peerService')
  const peer = await peerService.get(args.id)
  if (!peer) {
    throw new Error('No peer')
  }
  return peer
}

export const createPeer: MutationResolvers<ApolloContext>['createPeer'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreatePeerMutationResponse'] => {
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
      peer: peerOrError
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
      code: '400',
      message: 'Error trying to create peer',
      success: false
    }
  }
}

export const updatePeer: MutationResolvers<ApolloContext>['updatePeer'] = async (
  parent,
  args,
  ctx
): ResolversTypes['UpdatePeerMutationResponse'] => {
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
      peer: peerOrError
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

export const deletePeer: MutationResolvers<ApolloContext>['deletePeer'] = async (
  parent,
  args,
  ctx
): ResolversTypes['DeletePeerMutationResponse'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const getPeersConnectionPageInfo: PeersConnectionResolvers<ApolloContext>['pageInfo'] = async (
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
    peerService: await ctx.container.use('peerService'),
    edges
  })
}

const getPageInfo = async ({
  peerService,
  edges
}: {
  peerService: PeerService
  edges: PeerEdge[]
}): ResolversTypes['PageInfo'] => {
  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  let hasNextPagePeers, hasPreviousPagePeers
  try {
    hasNextPagePeers = await peerService.getPage({
      after: lastEdge,
      first: 1
    })
  } catch (e) {
    hasNextPagePeers = []
  }
  try {
    hasPreviousPagePeers = await peerService.getPage({
      before: firstEdge,
      last: 1
    })
  } catch (e) {
    hasPreviousPagePeers = []
  }

  return {
    endCursor: lastEdge,
    hasNextPage: hasNextPagePeers.length == 1,
    hasPreviousPage: hasPreviousPagePeers.length == 1,
    startCursor: firstEdge
  }
}
