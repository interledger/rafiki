import { ResolversTypes, MutationResolvers } from '../generated/graphql'
import { Peer } from '../../payment-method/ilp/peer/model'
import { ApolloContext } from '../../app'
import {
  AutoPeeringError,
  errorToCode,
  errorToMessage,
  isAutoPeeringError
} from '../../payment-method/ilp/auto-peering/errors'
import { peerToGraphql } from './peer'
import { GraphQLError } from 'graphql'

export const createOrUpdatePeerByUrl: MutationResolvers<ApolloContext>['createOrUpdatePeerByUrl'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['CreateOrUpdatePeerByUrlMutationResponse']> => {
    const autoPeeringService = await ctx.container.use('autoPeeringService')
    const peerOrError: Peer | AutoPeeringError =
      await autoPeeringService.initiatePeeringRequest(args.input)
    if (isAutoPeeringError(peerOrError)) {
      throw new GraphQLError(errorToMessage[peerOrError], {
        extensions: {
          code: errorToCode[peerOrError]
        }
      })
    } else {
      return {
        peer: peerToGraphql(peerOrError)
      }
    }
  }
