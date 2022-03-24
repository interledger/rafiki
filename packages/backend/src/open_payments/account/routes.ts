import { validateId } from '../../shared/utils'
import { AppContext } from '../../app'
import { IAppConfig } from '../../config/app'
import { AccountService } from './service'

interface ServiceDependencies {
  config: IAppConfig
  accountService: AccountService
}

export interface AccountRoutes {
  get(ctx: AppContext): Promise<void>
}

export function createAccountRoutes(deps: ServiceDependencies): AccountRoutes {
  return {
    get: (ctx: AppContext) => getAccount(deps, ctx)
  }
}

// Spec: https://docs.openpayments.dev/accounts#get
export async function getAccount(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { accountId } = ctx.params
  ctx.assert(validateId(accountId), 400, 'Invalid account id')
  ctx.assert(ctx.accepts('application/json'), 406)

  const account = await deps.accountService.get(accountId)
  if (!account) {
    ctx.throw(404)
    return // unreachable, but satisfies typescript
  }

  const config = await deps.config
  ctx.body = {
    id: `${config.publicHost}/accounts/${encodeURIComponent(accountId)}`,
    publicName: account.publicName,
    assetCode: account.asset.code,
    assetScale: account.asset.scale,
    authServer: config.authServerGrantUrl
  }
}
