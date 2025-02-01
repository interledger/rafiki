import { TenantedApolloContext } from "../../app";
import { Pagination } from "../../shared/baseModel";
import { getPageInfo } from "../../shared/pagination";
import { TenantSetting } from "../../tenants/settings/model";
import { ResolversTypes, SortOrder, TenantResolvers, TenantSetting as SchemaTenantSetting, MutationResolvers } from "../generated/graphql";

export const getTenantSettings: TenantResolvers<TenantedApolloContext>['settings'] = 
    async (
        parent,
        args,
        ctx
    ): Promise<ResolversTypes['TenantSettingsConnection']> => {
        if (!parent.id) {
            throw new Error('missing tenant id')
        }

        const tenantSettingsService = await ctx.container.use('tenantSettingService')

        const { sortOrder, ...pagination } = args
        const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc

        const tenantSettings = await tenantSettingsService.getPage(parent.id, pagination, order)
        const pageInfo = await getPageInfo({
            getPage: (pagination_?: Pagination, sortOrder_?: SortOrder) => 
                tenantSettingsService.getPage(parent.id!, pagination_, sortOrder_),
            page: tenantSettings
        })

        return {
            pageInfo,
            edges: tenantSettings.map((ts: TenantSetting) => ({
                cursor: ts.id,
                node: tenantSettingsToGraphql(ts)
            }))
        }
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
            setting: args.input
        })
        
        return {
            settings: tenantSettings.map(x => tenantSettingsToGraphql(x))
        }
    }

export const tenantSettingsToGraphql = (tenantSetting: TenantSetting): SchemaTenantSetting => ({
    key: tenantSetting.key,
    value: tenantSetting.value
})