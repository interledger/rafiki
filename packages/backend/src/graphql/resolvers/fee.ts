import {
  ResolversTypes,
  MutationResolvers,
  Fee as SchemaFee
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { isFeeError, errorToCode, errorToMessage } from '../../fee/errors'
import { Fee } from '../../fee/model'

export const setFee: MutationResolvers<ApolloContext>['setFee'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['SetFeeResponse']> => {
  const feeService = await ctx.container.use('feeService')
  try {
    const feeOrError = await feeService.create(args.input)

    if (isFeeError(feeOrError)) {
      return {
        code: errorToCode[feeOrError].toString(),
        success: false,
        message: errorToMessage[feeOrError]
      }
    }
    return {
      code: '200',
      success: true,
      message: 'Fee set',
      fee: feeToGraphql(feeOrError)
    }
  } catch (error) {
    ctx.logger.error(
      {
        options: args.input,
        error
      },
      'error updating fee'
    )
    return {
      code: '500',
      success: false,
      message: 'Error trying to update fee'
    }
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
