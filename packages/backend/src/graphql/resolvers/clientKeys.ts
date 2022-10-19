import { ResolversTypes, MutationResolvers } from '../generated/graphql'
import { ApolloContext } from '../../app'
import { paymentPointerToGraphql } from './payment_pointer'
import { PaymentPointerService } from '../../open_payments/payment_pointer/service'

export const revokeClientKey: MutationResolvers<ApolloContext>['revokeClientKey'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['RevokeClientKeyMutationResponse']> => {
    try {
      const clientKeysService = await ctx.container.use('clientKeysService')
      const keyId = await clientKeysService.revokeKeyById(args.keyId)

      return {
        code: '200',
        success: true,
        message: 'Client key revoked',
        keyId: keyId
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.keyId,
          error
        },
        'error revoking client key'
      )

      return {
        code: '500',
        message: 'Error trying to revoke client key',
        success: false,
        keyId: args.keyId
      }
    }
  }

export const addKeyToClient: MutationResolvers<ApolloContext>['addKeyToClient'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['AddKeyToClientMutationResponse']> => {
    try {
      const paymentPointerService: PaymentPointerService =
        await ctx.container.use('paymentPointerService')

      const client = await paymentPointerService.addKeyToPaymentPointer({
        ...args.input,
        jwk: JSON.parse(args.input.jwk)
      })

      return {
        code: '200',
        success: true,
        message: 'Added Key To Client',
        paymentPointer: paymentPointerToGraphql(client)
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input,
          error
        },
        'error adding key to client'
      )

      return {
        code: '500',
        message: 'Error trying to add key to client',
        success: false
      }
    }
  }
