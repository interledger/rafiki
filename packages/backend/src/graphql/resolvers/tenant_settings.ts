import { GraphQLError } from 'graphql'
import { TenantedApolloContext } from '../../app'
import {
  isTenantSettingError,
  errorToCode,
  errorToMessage
} from '../../tenants/settings/errors'
import { TenantSetting, TenantSettingKeys } from '../../tenants/settings/model'
import {
  ResolversTypes,
  TenantResolvers,
  TenantSetting as SchemaTenantSetting,
  MutationResolvers,
  TenantSettingKey as SchemaTenantSettingKey
} from '../generated/graphql'

export const getTenantSettings: TenantResolvers<TenantedApolloContext>['settings'] =
  async (parent, args, ctx): Promise<ResolversTypes['TenantSetting'][]> => {
    if (!parent.id) {
      throw new Error('missing tenant id')
    }

    const tenantSettingsService = await ctx.container.use(
      'tenantSettingService'
    )

    const tenantSettings = await tenantSettingsService.get({
      tenantId: parent.id
    })

    return tenantSettingsToGraphql(tenantSettings)
  }

export const createTenantSettings: MutationResolvers<TenantedApolloContext>['createTenantSettings'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreateTenantSettingsMutationResponse']> => {
    const tenantSettingService = await ctx.container.use('tenantSettingService')

    const tenantSettingsOrError = await tenantSettingService.create({
      tenantId: ctx.tenant.id,
      setting: args.input.settings
    })

    if (isTenantSettingError(tenantSettingsOrError)) {
      throw new GraphQLError(errorToMessage[tenantSettingsOrError], {
        extensions: {
          code: errorToCode[tenantSettingsOrError]
        }
      })
    }

    return {
      settings: tenantSettingsToGraphql(tenantSettingsOrError)
    }
  }

const tenantSettingNameToGraphQl: { [key: string]: SchemaTenantSettingKey } = {
  [TenantSettingKeys.EXCHANGE_RATES_URL.name]:
    SchemaTenantSettingKey.ExchangeRatesUrl,
  [TenantSettingKeys.WEBHOOK_URL.name]: SchemaTenantSettingKey.WebhookUrl,
  [TenantSettingKeys.WEBHOOK_TIMEOUT.name]:
    SchemaTenantSettingKey.WebhookTimeout,
  [TenantSettingKeys.WEBHOOK_MAX_RETRY.name]:
    SchemaTenantSettingKey.WebhookMaxRetry,
  [TenantSettingKeys.WALLET_ADDRESS_URL.name]:
    SchemaTenantSettingKey.WalletAddressUrl,
  [TenantSettingKeys.ILP_ADDRESS.name]: SchemaTenantSettingKey.IlpAddress
}

const tenantSettingToGraphql = (
  tenantSetting: TenantSetting
): SchemaTenantSetting => ({
  key: tenantSettingNameToGraphQl[tenantSetting.key],
  value: tenantSetting.value
})

export const tenantSettingsToGraphql = (
  tenantSettings?: TenantSetting[]
): SchemaTenantSetting[] => {
  if (!tenantSettings) {
    return []
  }
  return tenantSettings.map((x) => tenantSettingToGraphql(x))
}
