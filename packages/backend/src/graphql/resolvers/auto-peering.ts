import { ResolversTypes, MutationResolvers } from '../generated/graphql'
import { Peer } from '../../peer/model'
import { ApolloContext } from '../../app'
import {
  AutoPeeringError,
  errorToCode,
  errorToMessage,
  isAutoPeeringError
} from '../../auto-peering/errors'
import { peerToGraphql } from './peer'

export const createPeerByUrl: MutationResolvers<ApolloContext>['createPeerByUrl'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['CreatePeerByUrlMutationResponse']> => {
    const autoPeeringService = await ctx.container.use('autoPeeringService')
    return autoPeeringService
      .initiatePeeringRequest(args.input)
      .then((peerOrError: Peer | AutoPeeringError) =>
        isAutoPeeringError(peerOrError)
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
