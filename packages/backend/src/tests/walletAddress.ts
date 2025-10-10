import axios from 'axios'
import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { Scope } from 'nock'
import { URL } from 'url'
import assert from 'assert'

import { testAccessToken } from './app'
import { createAsset } from './asset'
import { createTenant } from './tenant'
import { AppServices } from '../app'
import { isWalletAddressError } from '../open_payments/wallet_address/errors'
import { WalletAddress } from '../open_payments/wallet_address/model'
import { CreateOptions as BaseCreateOptions } from '../open_payments/wallet_address/service'
import { LiquidityAccountType } from '../accounting/service'
import { isTenantError } from '../tenants/errors'
import { v4 } from 'uuid'

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
  const tenantService = await deps.use('tenantService')
  const walletAddressService = await deps.use('walletAddressService')
  const tenantToUse = options.tenantId
    ? await tenantService.get(options.tenantId)
    : await createTenant(deps)
  assert.ok(tenantToUse)

  let baseWalletAddressUrl = new URL(
    options.address || tenantToUse.walletAddressPrefix
  )

  console.log('prefix=', tenantToUse.walletAddressPrefix)
  console.log('input=', `${baseWalletAddressUrl.href}/${v4()}/.well-known/pay`)

  const walletAddressOrError = (await walletAddressService.create({
    ...options,
    assetId:
      options.assetId ||
      (await createAsset(deps, { tenantId: tenantToUse.id })).id,
    tenantId: tenantToUse.id,
    address:
      options.address ||
      `${baseWalletAddressUrl.href}/${v4()}/.well-known/pay`
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
