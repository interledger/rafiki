import { generateJwk, JWK } from '@interledger/http-signature-utils'

import { WalletAddressKeysContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { WalletAddressService } from '../service'
import { WalletAddressKeyService } from './service'
import { Logger } from 'pino'

interface ServiceDependencies {
  walletAddressKeyService: WalletAddressKeyService
  walletAddressService: WalletAddressService
  config: IAppConfig
  logger: Logger
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
    const errorMessage =
      'Could not get wallet address keys. It is possible there is a wallet address configuration error for this Rafiki instance.'
    deps.logger.error(
      {
        requestedWalletAddress: ctx.walletAddressUrl,
        configuredWalletAddressUrl: deps.config.walletAddressUrl
      },
      errorMessage
    )

    throw new Error(errorMessage)
  }
}
