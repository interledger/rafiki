import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { Tenant } from '../tenant/model'
import { CreateTenantOptions } from '../tenant/service'
import { v4 as uuidv4 } from 'uuid'
import { EndpointType } from '../tenant/endpoints/model'
import nock from 'nock'

export function mockAdminAuthApiTenantCreation(mockedUrl: string) {
  const url = new URL(mockedUrl)
  return nock(`${url.protocol}//${url.host}`)
    .post(/.*/)
    .reply(200, {
      data: {
        createTenant: {
          tenant: {
            id: uuidv4()
          }
        }
      }
    })
}

export async function createTenant(
  deps: IocContract<AppServices>
): Promise<Tenant> {
  const tenantService = await deps.use('tenantService')

  const options: CreateTenantOptions = {
    name: uuidv4(),
    idpConsentEndpoint: `https://example.com/${uuidv4()}`,
    idpSecret: `secret-${uuidv4()}`,
    endpoints: [
      {
        type: EndpointType.RatesUrl,
        value: `https://example.com/rates/${uuidv4()}`
      },
      {
        type: EndpointType.WebhookBaseUrl,
        value: `https://example.com/webhook/${uuidv4()}`
      }
    ]
  }

  return tenantService.create(options) as Promise<Tenant>
}
