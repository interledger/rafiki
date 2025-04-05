import { TenantedApolloContext } from '../../app'
import { TenantSetting } from '../../tenants/settings/model'
import {
  ResolversTypes,
  TenantResolvers,
  TenantSetting as SchemaTenantSetting,
  MutationResolvers
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

    return tenantSettings.map((x) => tenantSettingsToGraphql(x))
  }

export const createTenantSettings: MutationResolvers<TenantedApolloContext>['createTenantSettings'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CreateTenantSettingsMutationResponse']> => {
    const tenantSettingService = await ctx.container.use('tenantSettingService')

    const tenantSettings = await tenantSettingService.create({
      tenantId: ctx.tenant.id,
      setting: args.input.settings
    })

    return {
      settings: tenantSettings.map((x) => tenantSettingsToGraphql(x))
    }
  }

export const tenantSettingsToGraphql = (
  tenantSetting: TenantSetting
): SchemaTenantSetting => ({
  key: tenantSetting.key,
  value: tenantSetting.value
})
