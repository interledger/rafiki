import { AccessAction } from '@interledger/open-payments'
import { WalletAddress, WalletAddressSubresource } from './model'
import {
  WalletAddressService,
  WalletAddressSubresourceService
} from './service'
import { WalletAddressUrlContext, ListContext } from '../../app'
import {
  getPageInfo,
  parsePaginationQueryParameters
} from '../../shared/pagination'
import { OpenPaymentsServerRouteError } from '../route-errors'

interface ServiceDependencies {
  authServer: string
  resourceServer: string
}

export interface WalletAddressRoutes {
  get(ctx: WalletAddressUrlContext): Promise<void>
}

export function createWalletAddressRoutes(
  deps: ServiceDependencies
): WalletAddressRoutes {
  return {
    get: (ctx: WalletAddressUrlContext) => getWalletAddress(deps, ctx)
  }
}

// Spec: https://docs.openpayments.guide/reference/get-public-account
export async function getWalletAddress(
  deps: ServiceDependencies,
  ctx: WalletAddressUrlContext
): Promise<void> {
  if (!ctx.walletAddress) {
    throw new OpenPaymentsServerRouteError(
      404,
      'Wallet address does not exist',
      {
        walletAddressUrl: ctx.walletAddressUrl
      }
    )
  }

  ctx.body = ctx.walletAddress.toOpenPaymentsType({
    authServer: deps.authServer,
    resourceServer: deps.resourceServer
  })
}

interface ListSubresourceOptions<M extends WalletAddressSubresource> {
  ctx: ListContext
  getWalletAddressPage: WalletAddressSubresourceService<M>['getWalletAddressPage']
  toBody: (model: M) => Record<string, unknown>
}

export const listSubresource = async <M extends WalletAddressSubresource>({
  ctx,
  getWalletAddressPage,
  toBody
}: ListSubresourceOptions<M>) => {
  if (ctx.request.query.last) {
    if (ctx.request.query.first) {
      throw new OpenPaymentsServerRouteError(
        400,
        'first and last are mutually exclusive',
        { queryParams: ctx.request.query }
      )
    } else if (!ctx.request.query.cursor) {
      throw new OpenPaymentsServerRouteError(400, 'last requires cursor', {
        queryParams: ctx.request.query
      })
    }
  }
  const pagination = parsePaginationQueryParameters(ctx.request.query)
  const client = ctx.accessAction === AccessAction.List ? ctx.client : undefined
  const page = await getWalletAddressPage({
    walletAddressId: ctx.walletAddress.id,
    pagination,
    client
  })
  const pageInfo = await getPageInfo({
    getPage: (pagination) =>
      getWalletAddressPage({
        walletAddressId: ctx.walletAddress.id,
        pagination,
        client
      }),
    page,
    walletAddress: ctx.request.query['wallet-address']
  })
  const result = {
    pagination: pageInfo,
    result: page.map((item: M) => toBody(item))
  }
  ctx.body = result
}
