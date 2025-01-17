import {
  ResolversTypes,
  MutationResolvers,
  WalletAddressKey as SchemaWalletAddressKey,
  Alg,
  Kty,
  Crv,
  WalletAddressResolvers,
  SortOrder
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { WalletAddressKey } from '../../open_payments/wallet_address/key/model'
import { GraphQLError } from 'graphql'
import { GraphQLErrorCode } from '../errors'
import { Pagination } from '../../shared/baseModel'
import { getPageInfo } from '../../shared/pagination'
import {
  errorToCode,
  errorToMessage,
  isWalletAddressKeyError
} from '../../open_payments/wallet_address/key/errors'

export const getWalletAddressKeys: WalletAddressResolvers<ApolloContext>['walletAddressKeys'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WalletAddressKeyConnection']> => {
    if (!parent.id) {
      throw new Error('missing wallet address id')
    }

    const walletAddressKeyService = await ctx.container.use(
      'walletAddressKeyService'
    )

    const { sortOrder, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc

    const walletAddressKeys = await walletAddressKeyService.getPage(
      parent.id,
      pagination,
      order
    )
    const pageInfo = await getPageInfo({
      getPage: (pagination_?: Pagination, sortOrder_?: SortOrder) =>
        walletAddressKeyService.getPage(parent.id!, pagination_, sortOrder_),
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

    const keyOrError = await walletAddressKeyService.create(args.input)
    if (isWalletAddressKeyError(keyOrError)) {
      throw new GraphQLError(errorToMessage[keyOrError], {
        extensions: {
          code: errorToCode[keyOrError]
        }
      })
    }

    return {
      walletAddressKey: walletAddressKeyToGraphql(keyOrError)
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
