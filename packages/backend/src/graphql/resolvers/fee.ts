import {
  ResolversTypes,
  MutationResolvers,
  Fee as SchemaFee
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { isFeeError, errorToCode, errorToMessage } from '../../fee/errors'
import { Fee } from '../../fee/model'
import { GraphQLError } from 'graphql'

export const setFee: MutationResolvers<ApolloContext>['setFee'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['SetFeeResponse']> => {
  const feeService = await ctx.container.use('feeService')
  const feeOrError = await feeService.create(args.input)

  if (isFeeError(feeOrError)) {
    throw new GraphQLError(errorToMessage[feeOrError], {
      extensions: {
        code: errorToCode[feeOrError]
      }
    })
  }
  return {
    fee: feeToGraphql(feeOrError)
  }
}

export const feeToGraphql = (fee: Fee): SchemaFee => {
  return {
    id: fee.id,
    assetId: fee.assetId,
    type: fee.type,
    fixed: fee.fixedFee,
    basisPoints: fee.basisPointFee,
    createdAt: new Date(fee.createdAt).toISOString()
  }
}
