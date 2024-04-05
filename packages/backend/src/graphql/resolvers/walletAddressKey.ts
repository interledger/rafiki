import {
  ResolversTypes,
  MutationResolvers,
  WalletAddressKey as SchemaWalletAddressKey,
  Alg,
  Kty,
  Crv,
  WalletAddressResolvers
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { WalletAddressKey } from '../../open_payments/wallet_address/key/model'
import { Pagination } from '../../shared/baseModel'
import { getPageInfo } from '../../shared/pagination'

export const getWalletAddressKeys: WalletAddressResolvers<ApolloContext>['walletAddressKeys'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WalletAddressKeyConnection']> => {
    const walletAddressKeyService = await ctx.container.use(
      'walletAddressKeyService'
    )

    const getPageFn = (pagination_: Pagination) => {
      if (!parent.id) throw new Error('missing wallet address id')
      return walletAddressKeyService.getPage(parent.id, pagination_)
    }

    const { ...pagination } = args

    const walletAddressKeys = await getPageFn(pagination)
    ctx.logger.info({ walletAddressKeys }, 'got walletAddressKeys')
    const pageInfo = await getPageInfo({
      getPage: (pagination_: Pagination) => getPageFn(pagination_),
      page: walletAddressKeys
    })

    return {
      pageInfo,
      edges: walletAddressKeys.map((walletAddressKey: WalletAddressKey) => ({
        cursor: walletAddressKey.id,
        node: walletAddressKeyToGraphql(walletAddressKey)
      }))
    }
  }

export const revokeWalletAddressKey: MutationResolvers<ApolloContext>['revokeWalletAddressKey'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['RevokeWalletAddressKeyMutationResponse']> => {
    try {
      const walletAddressKeyService = await ctx.container.use(
        'walletAddressKeyService'
      )
      const key = await walletAddressKeyService.revoke(args.input.id)
      if (!key) {
        return {
          code: '404',
          success: false,
          message: 'Wallet address key not found'
        }
      }

      return {
        code: '200',
        success: true,
        message: 'Wallet address key revoked',
        walletAddressKey: walletAddressKeyToGraphql(key)
      }
    } catch (err) {
      ctx.logger.error(
        {
          options: args.input.id,
          err
        },
        'error revoking wallet address key'
      )

      return {
        code: '500',
        message: 'Error trying to revoke wallet address key',
        success: false
      }
    }
  }

export const createWalletAddressKey: MutationResolvers<ApolloContext>['createWalletAddressKey'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreateWalletAddressKeyMutationResponse']> => {
    try {
      const walletAddressKeyService = await ctx.container.use(
        'walletAddressKeyService'
      )

      const key = await walletAddressKeyService.create(args.input)

      return {
        code: '200',
        success: true,
        message: 'Added Key To Wallet Address',
        walletAddressKey: walletAddressKeyToGraphql(key)
      }
    } catch (err) {
      ctx.logger.error(
        {
          options: args.input,
          err
        },
        'error creating wallet address key'
      )

      return {
        code: '500',
        message: 'Error trying to create wallet address key',
        success: false
      }
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
