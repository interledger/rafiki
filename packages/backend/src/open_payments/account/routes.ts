import { AccountContext } from '../../app'
import { IAppConfig } from '../../config/app'
import { AccountService } from './service'

interface ServiceDependencies {
  config: IAppConfig
  accountService: AccountService
}

export interface AccountRoutes {
  get(ctx: AccountContext): Promise<void>
}

export function createAccountRoutes(deps: ServiceDependencies): AccountRoutes {
  return {
    get: (ctx: AccountContext) => getAccount(deps, ctx)
  }
}

// Spec: https://docs.openpayments.guide/reference/get-public-account
export async function getAccount(
  deps: ServiceDependencies,
  ctx: AccountContext
): Promise<void> {
  const account = await deps.accountService.get(ctx.params.accountId)
  if (!account) {
    ctx.throw(404)
    return // unreachable, but satisfies typescript
  }

  const config = await deps.config
  ctx.body = {
    id: `${config.publicHost}/${encodeURIComponent(account.id)}`,
    publicName: account.publicName ?? undefined,
    assetCode: account.asset.code,
    assetScale: account.asset.scale,
    authServer: config.authServerGrantUrl
  }
}
