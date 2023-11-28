import { AccessAction } from '@interledger/open-payments'
import { WalletAddressSubresource } from './model'
import { WalletAddressSubresourceService } from './service'
import { WalletAddressContext, ListContext } from '../../app'
import {
  getPageInfo,
  parsePaginationQueryParameters
} from '../../shared/pagination'

interface ServiceDependencies {
  authServer: string
}

export interface WalletAddressRoutes {
  get(ctx: WalletAddressContext): Promise<void>
}

export function createWalletAddressRoutes(
  deps: ServiceDependencies
): WalletAddressRoutes {
  return {
    get: (ctx: WalletAddressContext) => getWalletAddress(deps, ctx)
  }
}

// Spec: https://docs.openpayments.guide/reference/get-public-account
export async function getWalletAddress(
  deps: ServiceDependencies,
  ctx: WalletAddressContext
): Promise<void> {
  if (!ctx.walletAddress) {
    return ctx.throw(404)
  }

  ctx.body = ctx.walletAddress.toOpenPaymentsType({
    authServer: deps.authServer
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
      ctx.throw(400, 'first and last are mutually exclusive')
    } else if (!ctx.request.query.cursor) {
      ctx.throw(400, 'last requires cursor')
    }
  }
  const pagination = parsePaginationQueryParameters(ctx.request.query)
  const client = ctx.accessAction === AccessAction.List ? ctx.client : undefined
  const page = await getWalletAddressPage({
    walletAddressId: ctx.walletAddress.id,
    pagination,
    client
  })
  const pageInfo = await getPageInfo(
    (pagination) =>
      getWalletAddressPage({
        walletAddressId: ctx.walletAddress.id,
        pagination,
        client
      }),
    page
  )
  const result = {
    pagination: pageInfo,
    result: page.map((item: M) => toBody(item))
  }
  ctx.body = result
}
