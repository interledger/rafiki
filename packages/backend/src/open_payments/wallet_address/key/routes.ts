import { generateJwk, JWK } from '@interledger/http-signature-utils'

import { WalletAddressUrlContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { WalletAddressKeyService } from './service'
import { Logger } from 'pino'
import { WalletAddressService } from '../service'
import { OpenPaymentsServerRouteError } from '../../route-errors'

interface ServiceDependencies {
  walletAddressKeyService: WalletAddressKeyService
  walletAddressService: WalletAddressService
  config: IAppConfig
  logger: Logger
  jwk: JWK
}

export interface WalletAddressKeyRoutes {
  get(ctx: WalletAddressUrlContext): Promise<void>
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
    get: (ctx: WalletAddressUrlContext) => getWalletAddressKeys(deps, ctx)
  }
}

export async function getWalletAddressKeys(
  deps: ServiceDependencies,
  ctx: WalletAddressUrlContext
): Promise<void> {
  if (deps.config.walletAddressUrl === ctx.walletAddressUrl) {
    ctx.body = {
      keys: [deps.jwk]
    }
    return
  }

  const walletAddress = await deps.walletAddressService.getOrPollByUrl(
    ctx.walletAddressUrl
  )

  if (!walletAddress?.isActive) {
    throw new OpenPaymentsServerRouteError(
      404,
      'Could not get wallet address',
      {
        walletAddressUrl: ctx.walletAddressUrl
      }
    )
  }

  const keys = await deps.walletAddressKeyService.getKeysByWalletAddressId(
    walletAddress.id
  )

  ctx.body = {
    keys: keys.map((key) => key.jwk)
  }
}
