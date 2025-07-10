import { Session } from '@remix-run/node'
import { TenantInstanceConfig, TenantOptions } from './types'
import { parse } from 'yaml'
import { readFileSync } from 'fs'
import { listTenants } from './requesters'
import { TenantEdge } from 'generated/graphql'

export function formatAmount(amount: string, scale: number) {
  const value = BigInt(amount)
  const divisor = BigInt(10 ** scale)

  const integerPart = (value / divisor).toString()
  const fractionalPart = (value % divisor).toString().padStart(scale, '0')

  return `${integerPart}.${fractionalPart}`
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export const parseBool = (str: string) => {
  return ['true', 't', '1'].includes(str.toLowerCase())
}

export function getOpenPaymentsUrl() {
  const env = typeof window === 'undefined' ? process.env : window.ENV

  if (!env?.OPEN_PAYMENTS_URL) {
    throw new Error('Environment variable OPEN_PAYMENTS_URL is missing')
  }

  return env.OPEN_PAYMENTS_URL
}

export async function getTenantCredentials(
  session: Session
): Promise<TenantOptions | undefined> {
  const instanceConfig: TenantInstanceConfig = {
    isTenant: process?.env?.IS_TENANT === 'true',
    seed: parse(
      readFileSync(
        process?.env?.SEED_FILE_LOCATION || './seed.example.yaml'
      ).toString('utf-8')
    )
  }

  if (!instanceConfig.isTenant) {
    return
  }
  const tenantId = session.get('tenantId')
  const apiSecret = session.get('apiSecret')
  const walletAddressPrefix = session.get('walletAddressPrefix')
  if (!tenantId || !apiSecret || !walletAddressPrefix) {
    const tenants = await listTenants()
    const tenant: TenantEdge = tenants.edges.find(
      (tenant: TenantEdge) =>
        tenant.node.apiSecret === instanceConfig.seed.tenants[0].apiSecret
    )

    session.set('tenantId', tenant.node.id)
    session.set('apiSecret', tenant.node.apiSecret)
    session.set(
      'walletAddressPrefix',
      instanceConfig.seed.tenants[0].walletAddressPrefix
    )
    return {
      tenantId: tenant.node.id,
      apiSecret: tenant.node.apiSecret,
      walletAddressPrefix: instanceConfig.seed.tenants[0].walletAddressPrefix
    }
  } else {
    return { tenantId, apiSecret, walletAddressPrefix }
  }
}
