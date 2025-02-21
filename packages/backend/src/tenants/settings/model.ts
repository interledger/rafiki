import { Pojo } from 'objection'
import { BaseModel } from '../../shared/baseModel'
import { KeyValuePair } from './service'

interface TenantSettingKeyType {
  name: string
  default?: unknown
}

export const TenantSettingKeys: { [key: string]: TenantSettingKeyType } = {
  EXCHANGE_RATES_URL: { name: 'EXCHANGE_RATES_URL' },
  WEBHOOK_URL: { name: 'WEBHOOK_URL' },
  WEBHOOK_TIMEOUT: { name: 'WEBHOOK_TIMEOUT', default: 2000 },
  WEBHOOK_MAX_RETRY: { name: 'WEBHOOK_MAX_RETRY', default: 10 },
  WALLET_ADDRESS_URL: { name: 'WALLET_ADDRESS_URL' }
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
  [TenantSettingKeys.WEBHOOK_URL.name]: 'webhookUrl'
}

export type FormattedTenantSettings = Record<
  (typeof TENANT_KEY_MAPPING)[keyof typeof TENANT_KEY_MAPPING],
  Omit<TenantSetting, 'key'>
>

export const formatSettings = (
  settings: TenantSetting | TenantSetting[]
): Partial<FormattedTenantSettings> => {
  const settingsObj: Partial<FormattedTenantSettings> = {}
  if (Symbol.iterator in settings) {
    for (const setting of settings) {
      const { key } = setting
      settingsObj[TENANT_KEY_MAPPING[key]] = setting
    }
  } else {
    settingsObj[TENANT_KEY_MAPPING[settings.key]] = settings
  }
  return settingsObj
}
