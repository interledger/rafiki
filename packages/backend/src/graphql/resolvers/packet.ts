import { ResolversTypes, MutationResolvers } from '../generated/graphql'
import { ApolloContext } from '../../app'

export const confirmPreparePacket: MutationResolvers<ApolloContext>['confirmPreparePacket'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['ConfirmPreparePacketResponse']> => {
    const redis = await ctx.container.use('redis')
    redis.set(args.input.id, 'confirmed')

    return {
      id: args.input.id
    }
  }
