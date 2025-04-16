import axios from 'axios'
import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { Scope } from 'nock'
import { URL } from 'url'

import { testAccessToken } from './app'
import { createAsset } from './asset'
import { createTenant } from './tenant'
import { AppServices } from '../app'
import { isWalletAddressError } from '../open_payments/wallet_address/errors'
import { WalletAddress } from '../open_payments/wallet_address/model'
import { CreateOptions as BaseCreateOptions } from '../open_payments/wallet_address/service'
import { LiquidityAccountType } from '../accounting/service'
import { createTenantSettings } from './tenantSettings'
import { TenantSettingKeys } from '../tenants/settings/model'

const nock = (global as unknown as { nock: typeof import('nock') }).nock

interface CreateOptions extends Partial<BaseCreateOptions> {
  mockServerPort?: number
  createLiquidityAccount?: boolean
  deactivatedAt?: Date
}

export type MockWalletAddress = WalletAddress & {
  scope?: Scope
}

export async function createWalletAddress(
  deps: IocContract<AppServices>,
  options: Partial<CreateOptions> = {}
): Promise<MockWalletAddress> {
  const walletAddressService = await deps.use('walletAddressService')
  const tenantIdToUse = options.tenantId || (await createTenant(deps)).id

  const baseWalletAddressUrl = new URL(
    options.address || `https://${faker.internet.domainName()}`
  )
  await createTenantSettings(deps, {
    tenantId: tenantIdToUse,
    setting: [
      {
        key: TenantSettingKeys.WALLET_ADDRESS_URL.name,
        value: baseWalletAddressUrl.origin
      }
    ]
  })
  const walletAddressOrError = (await walletAddressService.create({
    ...options,
    assetId:
      options.assetId ||
      (await createAsset(deps, { tenantId: tenantIdToUse })).id,
    tenantId: tenantIdToUse,
    address: options.address || `${baseWalletAddressUrl.origin}/.well-known/pay`
  })) as MockWalletAddress
  if (isWalletAddressError(walletAddressOrError)) {
    throw new Error(walletAddressOrError)
  }
  if (options.createLiquidityAccount) {
    const accountingService = await deps.use('accountingService')
    await accountingService.createLiquidityAccount(
      {
        id: walletAddressOrError.id,
        asset: walletAddressOrError.asset
      },
      LiquidityAccountType.WEB_MONETIZATION
    )
  }
  if (options.mockServerPort) {
    const url = new URL(walletAddressOrError.address)
    walletAddressOrError.scope = nock(url.origin)
      .get((uri) => uri.startsWith(url.pathname))
      .matchHeader('Accept', /application\/((ilp-stream|spsp4)\+)?json*./)
      .reply(200, function (path) {
        const headers = this.req.headers
        if (!headers['authorization']) {
          headers.authorization = `GNAP ${testAccessToken}`
        }
        return axios
          .get(`http://localhost:${options.mockServerPort}${path}`, {
            headers
          })
          .then((res) => res.data)
      })
      .persist()
  }
  return walletAddressOrError
}
