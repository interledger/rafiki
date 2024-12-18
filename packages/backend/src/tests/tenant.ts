import nock from 'nock'
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
  const config = await deps.use('config')
  const scope = nock(config.authAdminApiUrl)
    .post('')
    .reply(200, { data: { createTenant: { id: 1234 } } })
  const tenant = await tenantService.create(
    options || {
      email: faker.internet.email(),
      apiSecret: 'test-api-secret',
      publicName: faker.company.name(),
      idpConsentUrl: faker.internet.url(),
      idpSecret: 'test-idp-secret'
    }
  )
  scope.done()

  if (!tenant) {
    throw Error('Failed to create test tenant')
  }

  return tenant
}
