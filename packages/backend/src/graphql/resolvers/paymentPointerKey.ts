import {
  ResolversTypes,
  MutationResolvers,
  PaymentPointerKey as SchemaPaymentPointerKey
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { PaymentPointerKey } from '../../paymentPointerKey/model'

export const revokePaymentPointerKey: MutationResolvers<ApolloContext>['revokePaymentPointerKey'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['RevokePaymentPointerKeyMutationResponse']> => {
    try {
      const paymentPointerKeyService = await ctx.container.use(
        'paymentPointerKeyService'
      )
      const keyId = await paymentPointerKeyService.revokeKeyById(args.keyId)

      return {
        code: '200',
        success: true,
        message: 'Payment pointer key revoked',
        keyId: keyId
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.keyId,
          error
        },
        'error revoking payment pointer key'
      )

      return {
        code: '500',
        message: 'Error trying to revoke payment pointer key',
        success: false,
        keyId: args.keyId
      }
    }
  }

export const createPaymentPointerKey: MutationResolvers<ApolloContext>['createPaymentPointerKey'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreatePaymentPointerKeyMutationResponse']> => {
    try {
      const paymentPointerKeyService = await ctx.container.use(
        'paymentPointerKeyService'
      )

      const key = await paymentPointerKeyService.create({
        ...args.input,
        jwk: JSON.parse(args.input.jwk)
      })

      return {
        code: '200',
        success: true,
        message: 'Added Key To Payment Pointer',
        paymentPointerKey: paymentPointerKeyToGraphql(key)
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input,
          error
        },
        'error creating payment pointer key'
      )

      return {
        code: '500',
        message: 'Error trying to create payment pointer key',
        success: false
      }
    }
  }

export const paymentPointerKeyToGraphql = (
  paymentPointerKey: PaymentPointerKey
): SchemaPaymentPointerKey => ({
  id: paymentPointerKey.id,
  paymentPointerId: paymentPointerKey.paymentPointerId,
  jwk: JSON.stringify(paymentPointerKey.jwk),
  createdAt: new Date(+paymentPointerKey.createdAt).toISOString()
})
