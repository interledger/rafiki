import { assetToGraphql } from './asset'
import {
  QueryResolvers,
  ResolversTypes,
  PaymentPointer as SchemaPaymentPointer,
  MutationResolvers
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import {
  PaymentPointerError,
  isPaymentPointerError,
  errorToCode,
  errorToMessage
} from '../../open_payments/payment_pointer/errors'
import { PaymentPointer } from '../../open_payments/payment_pointer/model'

export const getPaymentPointer: QueryResolvers<ApolloContext>['paymentPointer'] =
  async (parent, args, ctx): Promise<ResolversTypes['PaymentPointer']> => {
    const paymentPointerService = await ctx.container.use(
      'paymentPointerService'
    )
    const paymentPointer = await paymentPointerService.get(args.id)
    if (!paymentPointer) {
      throw new Error('No payment pointer')
    }
    return paymentPointerToGraphql(paymentPointer)
  }

export const createPaymentPointer: MutationResolvers<ApolloContext>['createPaymentPointer'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreatePaymentPointerMutationResponse']> => {
    const paymentPointerService = await ctx.container.use(
      'paymentPointerService'
    )
    return paymentPointerService
      .create(args.input)
      .then((paymentPointerOrError: PaymentPointer | PaymentPointerError) =>
        isPaymentPointerError(paymentPointerOrError)
          ? {
              code: errorToCode[paymentPointerOrError].toString(),
              success: false,
              message: errorToMessage[paymentPointerOrError]
            }
          : {
              code: '200',
              success: true,
              message: 'Created payment pointer',
              paymentPointer: paymentPointerToGraphql(paymentPointerOrError)
            }
      )
      .catch(() => ({
        code: '500',
        success: false,
        message: 'Error trying to create payment pointer'
      }))
  }

export const triggerPaymentPointerEvents: MutationResolvers<ApolloContext>['triggerPaymentPointerEvents'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['TriggerPaymentPointerEventsMutationResponse']> => {
    try {
      const paymentPointerService = await ctx.container.use(
        'paymentPointerService'
      )
      const count = await paymentPointerService.triggerEvents(args.limit)
      return {
        code: '200',
        success: true,
        message: 'Triggered Payment Pointer Events',
        count
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.limit,
          error
        },
        'error triggering payment pointer events'
      )
      return {
        code: '500',
        message: 'Error trying to trigger payment pointer events',
        success: false
      }
    }
  }

export const paymentPointerToGraphql = (
  paymentPointer: PaymentPointer
): SchemaPaymentPointer => ({
  id: paymentPointer.id,
  url: paymentPointer.url,
  asset: assetToGraphql(paymentPointer.asset),
  publicName: paymentPointer.publicName ?? undefined,
  createdAt: new Date(+paymentPointer.createdAt).toISOString()
})
