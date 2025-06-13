import { Pojo } from 'objection'
import { BaseModel } from '../../shared/baseModel'
import { KeyValuePair } from './service'
import { isValidIlpAddress } from 'ilp-packet'

interface TenantSettingKeyType {
  name: string
  default?: unknown
}

export const TenantSettingKeys: { [key: string]: TenantSettingKeyType } = {
  EXCHANGE_RATES_URL: { name: 'EXCHANGE_RATES_URL' },
  WEBHOOK_URL: { name: 'WEBHOOK_URL' },
  WEBHOOK_TIMEOUT: { name: 'WEBHOOK_TIMEOUT', default: 2000 },
  WEBHOOK_MAX_RETRY: { name: 'WEBHOOK_MAX_RETRY', default: 10 },
  WALLET_ADDRESS_URL: { name: 'WALLET_ADDRESS_URL' },
  ILP_ADDRESS: { name: 'ILP_ADDRESS' }
}

export class TenantSetting extends BaseModel {
  public static get tableName(): string {
    return 'tenantSettings'
  }

  public key!: string
  public value!: string
  public tenantId!: string

  public deletedAt?: Date

  $formatJson(json: Pojo): Pojo {
    json = super.$formatJson(json)
    return {
      ...json,
      deletedAt: json.deletedAt.toISOString()
    }
  }

  static default(): KeyValuePair[] {
    const settings = []
    for (const key of Object.keys(TenantSettingKeys)) {
      const data = TenantSettingKeys[key]
      if (!data.default) {
        continue
      }

      settings.push({
        key: data.name,
        value: String(data.default)
      })
    }

    return settings
  }
}

const TENANT_KEY_MAPPING = {
  [TenantSettingKeys.EXCHANGE_RATES_URL.name]: 'exchangeRatesUrl',
  [TenantSettingKeys.WEBHOOK_MAX_RETRY.name]: 'webhookMaxRetry',
  [TenantSettingKeys.WEBHOOK_TIMEOUT.name]: 'webhookTimeout',
  [TenantSettingKeys.WEBHOOK_URL.name]: 'webhookUrl',
  [TenantSettingKeys.WALLET_ADDRESS_URL.name]: 'walletAddressUrl',
  [TenantSettingKeys.ILP_ADDRESS.name]: 'ilpAddress'
} as const

export type FormattedTenantSettings = Record<
  (typeof TENANT_KEY_MAPPING)[keyof typeof TENANT_KEY_MAPPING],
  TenantSetting['value']
>

export const formatSettings = (
  settings: TenantSetting[]
): Partial<FormattedTenantSettings> => {
  const settingsObj: Partial<FormattedTenantSettings> = {}
  for (const setting of settings) {
    const { key } = setting
    settingsObj[TENANT_KEY_MAPPING[key]] = setting.value
  }
  return settingsObj
}

const validateUrlTenantSetting = (url: string): boolean => {
  try {
    return !!new URL(url)
  } catch (err) {
    return false
  }
}

const validateIlpAddressTenantSetting = (ilpAddress: string): boolean => {
  return isValidIlpAddress(ilpAddress)
}

const validateNonNegativeTenantSetting = (numberString: string): boolean => {
  return !!(Number.isFinite(Number(numberString)) && Number(numberString) > -1)
}

const validatePositiveTenantSetting = (numberString: string): boolean => {
  return !!(Number.isFinite(Number(numberString)) && Number(numberString) > 0)
}

export const TENANT_SETTING_VALIDATORS = {
  [TenantSettingKeys.EXCHANGE_RATES_URL.name]: validateUrlTenantSetting,
  [TenantSettingKeys.WEBHOOK_MAX_RETRY.name]: validateNonNegativeTenantSetting,
  [TenantSettingKeys.WEBHOOK_TIMEOUT.name]: validatePositiveTenantSetting,
  [TenantSettingKeys.WEBHOOK_URL.name]: validateUrlTenantSetting,
  [TenantSettingKeys.WALLET_ADDRESS_URL.name]: validateUrlTenantSetting,
  [TenantSettingKeys.ILP_ADDRESS.name]: validateIlpAddressTenantSetting
}
