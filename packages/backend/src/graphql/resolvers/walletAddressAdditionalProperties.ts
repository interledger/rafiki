import {
  ResolversTypes,
  AdditionalProperty,
  WalletAddressResolvers
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { WalletAddressAdditionalProperty } from '../../open_payments/wallet_address/additional_property/model'

export const getWalletAddressAdditionalProperties: WalletAddressResolvers<ApolloContext>['additionalProperties'] =
  async (
    parent,
    args,
    ctx
  ): Promise<Array<ResolversTypes['AdditionalProperty']>> => {
    const { id: walletAddressId } = parent

    if (!walletAddressId) {
      throw new Error('missing wallet address id')
    }
    const walletAddressService = await ctx.container.use('walletAddressService')
    const additionalProperties =
      await walletAddressService.getAdditionalProperties(
        walletAddressId,
        false // Include all Additional Properties
      )
    if (!additionalProperties) return []

    return additionalProperties.map((itm) => additionalPropertyToGraphql(itm))
  }

export const additionalPropertyToGraphql = (
  addProp: WalletAddressAdditionalProperty
): AdditionalProperty => ({
  key: addProp.fieldKey,
  value: addProp.fieldValue,
  visibleInOpenPayments: addProp.visibleInOpenPayments
})
