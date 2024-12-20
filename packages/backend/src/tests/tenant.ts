import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { AppServices } from '../app'
import { Tenant } from '../tenants/model'

interface CreateOptions {
  email: string
  publicName?: string
  apiSecret: string
  idpConsentUrl: string
  idpSecret: string
}

export async function createTenant(
  deps: IocContract<AppServices>,
  options?: CreateOptions
): Promise<Tenant> {
  const tenantService = await deps.use('tenantService')
  const authServiceClient = await deps.use('authServiceClient')
  jest
    .spyOn(authServiceClient.tenant, 'create')
    .mockImplementationOnce(async () => undefined)
  const tenant = await tenantService.create(
    options || {
      email: faker.internet.email(),
      apiSecret: 'test-api-secret',
      publicName: faker.company.name(),
      idpConsentUrl: faker.internet.url(),
      idpSecret: 'test-idp-secret'
    }
  )

  if (!tenant) {
    throw Error('Failed to create test tenant')
  }

  return tenant
}
