import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { Tenant } from '../tenant/model'
import { v4 as uuidv4 } from 'uuid'
import { EndpointType } from '../tenant/endpoints/model'
import { faker } from '@faker-js/faker'
import nock from 'nock'

export function randomTenant() {
  return {
    name: faker.company.name(),
    idpConsentEndpoint: faker.internet.url(),
    idpSecret: faker.string.sample(10),
    endpoints: [
      {
        type: EndpointType.RatesUrl,
        value: faker.internet.url()
      },
      {
        type: EndpointType.WebhookBaseUrl,
        value: faker.internet.url()
      }
    ]
  }
}

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
  return tenantService.create(randomTenant()) as Promise<Tenant>
}
