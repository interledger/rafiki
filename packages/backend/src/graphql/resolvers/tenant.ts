import { GraphQLError } from 'graphql'
import { ApolloContext } from '../../app'
import { errorToCode, errorToMessage, isTenantError } from '../../tenant/errors'
import {
  MutationResolvers,
  ResolversTypes,
  TenantEndpointType
} from '../generated/graphql'
import { EndpointType } from '../../tenant/model'

const mapTenantEndpointTypeToModelEndpointType = {
  [TenantEndpointType.RatesUrl]: EndpointType.RatesUrl,
  [TenantEndpointType.WebhookBaseUrl]: EndpointType.WebhookBaseUrl
}

export const createTenant: MutationResolvers<ApolloContext>['createTenant'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['CreateTenantMutationResponse']> => {
    const tenantService = await ctx.container.use('tenantService')

    const tenantOrError = await tenantService.create({
      idpConsentEndpoint: args.input.idpConsentEndpoint,
      idpSecret: args.input.idpSecret,
      endpoints: args.input.endpoints.map((endpoint) => {
        return {
          value: endpoint.value,
          type: mapTenantEndpointTypeToModelEndpointType[endpoint.type]
        }
      })
    })

    if (isTenantError(tenantOrError)) {
      throw new GraphQLError(errorToMessage[tenantOrError], {
        extensions: {
          code: errorToCode[tenantOrError]
        }
      })
    }

    return { tenant: tenantOrError }
  }
