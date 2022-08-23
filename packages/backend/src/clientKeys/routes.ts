import { ClientKeysContext } from '../app'
import { ClientKeysService } from './service'

interface ServiceDependencies {
  clientKeysService: ClientKeysService
}

export interface ClientKeysRoutes {
  get(ctx: ClientKeysContext): Promise<void>
}

export function createClientKeysRoutes(
  deps: ServiceDependencies
): ClientKeysRoutes {
  return {
    get: (ctx: ClientKeysContext) => getKeyById(deps, ctx)
  }
}

export async function getKeyById(
  deps: ServiceDependencies,
  ctx: ClientKeysContext
): Promise<void> {
  const key = await deps.clientKeysService.getKeyById(ctx.params.keyId)
  if (!key) {
    ctx.throw(404)
  }

  ctx.body = key
}
