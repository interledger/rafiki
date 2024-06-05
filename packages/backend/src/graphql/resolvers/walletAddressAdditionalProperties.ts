import {
  ResolversTypes,
  AdditionalProperty,
  QueryResolvers
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { WalletAddressAdditionalProperty } from '../../open_payments/wallet_address/additional_property/model'

export const getWalletAddressAdditionalProperties: QueryResolvers<ApolloContext>['additionalProperties'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['AdditionalPropertyConnection']> => {
    if (!args.walletAddressId) {
      throw new Error('missing wallet address id')
    }
    const walletAddressService = await ctx.container.use('walletAddressService')
    const additionalProperties =
      await walletAddressService.getAdditionalProperties(
        args.walletAddressId,
        false // Include all Additional Properties
      )
    if (!additionalProperties) return { properties: [] }

    return {
      properties: additionalProperties.map((itm) =>
        additionalPropertyToGraphql(itm)
      )
    }
  }

export const additionalPropertyToGraphql = (
  addProp: WalletAddressAdditionalProperty
): AdditionalProperty => ({
  key: addProp.fieldKey,
  value: addProp.fieldValue,
  visibleInOpenPayments: addProp.visibleInOpenPayments
})
