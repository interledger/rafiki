import { generateJwk, JWK } from '@interledger/http-signature-utils'

import { WalletAddressContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { WalletAddressKeyService } from './service'
import { Logger } from 'pino'

interface ServiceDependencies {
  walletAddressKeyService: WalletAddressKeyService
  config: IAppConfig
  logger: Logger
  jwk: JWK
}

export interface WalletAddressKeyRoutes {
  getKeysByWalletAddressId(ctx: WalletAddressContext): Promise<void>
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
    getKeysByWalletAddressId: (ctx: WalletAddressContext) =>
      getKeysByWalletAddressId(deps, ctx)
  }
}

export async function getKeysByWalletAddressId(
  deps: ServiceDependencies,
  ctx: WalletAddressContext
): Promise<void> {
  if (deps.config.walletAddressUrl === ctx.walletAddressUrl) {
    ctx.body = {
      keys: [deps.jwk]
    }
  } else {
    const keys = await deps.walletAddressKeyService.getKeysByWalletAddressId(
      ctx.walletAddress.id
    )

    ctx.body = {
      keys: keys.map((key) => key.jwk)
    }
  }
}
