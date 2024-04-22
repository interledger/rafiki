import {
  ResolversTypes,
  MutationResolvers,
  WalletAddressKey as SchemaWalletAddressKey,
  Alg,
  Kty,
  Crv
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { WalletAddressKey } from '../../open_payments/wallet_address/key/model'
import { GraphQLError } from 'graphql'
import { GraphQLErrorCode } from '../errors'

export const revokeWalletAddressKey: MutationResolvers<ApolloContext>['revokeWalletAddressKey'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['RevokeWalletAddressKeyMutationResponse']> => {
    const walletAddressKeyService = await ctx.container.use(
      'walletAddressKeyService'
    )
    const key = await walletAddressKeyService.revoke(args.input.id)
    if (!key) {
      throw new GraphQLError('Wallet address key not found', {
        extensions: {
          code: GraphQLErrorCode.NotFound
        }
      })
    }

    return {
      walletAddressKey: walletAddressKeyToGraphql(key)
    }
  }

export const createWalletAddressKey: MutationResolvers<ApolloContext>['createWalletAddressKey'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreateWalletAddressKeyMutationResponse']> => {
    const walletAddressKeyService = await ctx.container.use(
      'walletAddressKeyService'
    )

    const key = await walletAddressKeyService.create(args.input)

    return {
      walletAddressKey: walletAddressKeyToGraphql(key)
    }
  }

export const walletAddressKeyToGraphql = (
  walletAddressKey: WalletAddressKey
): SchemaWalletAddressKey => ({
  id: walletAddressKey.id,
  walletAddressId: walletAddressKey.walletAddressId,
  jwk: {
    ...walletAddressKey.jwk,
    alg: Alg.EdDsa,
    kty: Kty.Okp,
    crv: Crv.Ed25519
  },
  revoked: walletAddressKey.revoked,
  createdAt: new Date(+walletAddressKey.createdAt).toISOString()
})
