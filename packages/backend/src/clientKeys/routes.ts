import { ClientKeysContext } from '../app'
import { ClientService } from '../clients/service'
import { ClientKeysService } from './service'

interface ServiceDependencies {
  clientKeysService: ClientKeysService
  clientService: ClientService
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

  const clientDetails = await deps.clientService.getClient(key.clientId)
  if (!clientDetails) {
    ctx.throw(404)
  }

  ctx.body = {
    key: key.jwk,
    client: {
      id: clientDetails.id,
      name: clientDetails.name,
      uri: clientDetails.uri,
      email: clientDetails.email,
      image: clientDetails.image,
      paymentPointerUrl: clientDetails.paymentPointerUrl
    }
  }
}
