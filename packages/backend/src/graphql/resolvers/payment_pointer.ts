import {
  QueryResolvers,
  ResolversTypes,
  MutationResolvers
} from '../generated/graphql'
import { ApolloContext } from '../../app'

export const getPaymentPointer: QueryResolvers<ApolloContext>['paymentPointer'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PaymentPointer'] => {
  const paymentPointerService = await ctx.container.use('paymentPointerService')
  const paymentPointer = await paymentPointerService.get(args.id)
  if (!paymentPointer) {
    throw new Error('No payment pointer')
  }
  return paymentPointer
}

export const createPaymentPointer: MutationResolvers<ApolloContext>['createPaymentPointer'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreatePaymentPointerMutationResponse'] => {
  try {
    const paymentPointerService = await ctx.container.use(
      'paymentPointerService'
    )
    const paymentPointer = await paymentPointerService.create(args.input)
    return {
      code: '200',
      success: true,
      message: 'Created Payment Pointer',
      paymentPointer
    }
  } catch (error) {
    ctx.logger.error(
      {
        options: args.input,
        error
      },
      'error creating payment pointer'
    )
    return {
      code: '400',
      message: 'Error trying to create payment pointer',
      success: false
    }
  }
}
