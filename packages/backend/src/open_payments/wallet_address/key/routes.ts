import { generateJwk, JWK } from '@interledger/http-signature-utils'

import { WalletAddressKeysContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { WalletAddressService } from '../service'
import { WalletAddressKeyService } from './service'

interface ServiceDependencies {
  walletAddressKeyService: WalletAddressKeyService
  walletAddressService: WalletAddressService
  config: IAppConfig
  jwk: JWK
}

export interface WalletAddressKeyRoutes {
  getKeysByWalletAddressId(ctx: WalletAddressKeysContext): Promise<void>
}

export function createWalletAddressKeyRoutes(
  deps_: Omit<ServiceDependencies, 'jwk'>
): WalletAddressKeyRoutes {
  const deps = {
    ...deps_,
    jwk: generateJwk({
      privateKey: deps_.config.privateKey,
      keyId: deps_.config.keyId
    })
  }

  return {
    getKeysByWalletAddressId: (ctx: WalletAddressKeysContext) =>
      getKeysByWalletAddressId(deps, ctx)
  }
}

export async function getKeysByWalletAddressId(
  deps: ServiceDependencies,
  ctx: WalletAddressKeysContext
): Promise<void> {
  if (ctx.walletAddress) {
    const keys = await deps.walletAddressKeyService.getKeysByWalletAddressId(
      ctx.walletAddress.id
    )

    ctx.body = {
      keys: keys.map((key) => key.jwk)
    }
  } else if (deps.config.walletAddressUrl === ctx.walletAddressUrl) {
    ctx.body = {
      keys: [deps.jwk]
    }
  } else {
    return ctx.throw(404)
  }
}
