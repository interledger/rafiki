import { ResolversTypes, MutationResolvers } from '../generated/graphql'
import { ApolloContext } from '../../app'
import { paymentPointerToGraphql } from './payment_pointer'

export const revokePaymentPointerKey: MutationResolvers<ApolloContext>['revokePaymentPointerKey'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['RevokePaymentPointerKeyMutationResponse']> => {
    try {
      const clientKeysService = await ctx.container.use('clientKeysService')
      const keyId = await clientKeysService.revokeKeyById(args.keyId)

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

export const addKeyToPaymentPointer: MutationResolvers<ApolloContext>['addKeyToPaymentPointer'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['AddKeyToPaymentPointerMutationResponse']> => {
    try {
      const paymentPointerService = await ctx.container.use(
        'paymentPointerService'
      )

      const paymentPointer = await paymentPointerService.addKeyToPaymentPointer(
        {
          ...args.input,
          jwk: JSON.parse(args.input.jwk)
        }
      )

      return {
        code: '200',
        success: true,
        message: 'Added Key To Payment Pointer',
        paymentPointer: paymentPointerToGraphql(paymentPointer)
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input,
          error
        },
        'error adding key to payment pointer'
      )

      return {
        code: '500',
        message: 'Error trying to add key to payment pointer',
        success: false
      }
    }
  }
