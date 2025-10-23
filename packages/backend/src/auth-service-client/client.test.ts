import { faker } from '@faker-js/faker'
import nock from 'nock'
import { AuthServiceClient, AuthServiceClientError } from './client'

describe('AuthServiceClient', () => {
  const baseUrl = 'http://auth-service.biz'
  let client: AuthServiceClient

  beforeEach(() => {
    client = new AuthServiceClient(baseUrl)
    nock.cleanAll()
  })

  afterEach(() => {
    expect(nock.isDone()).toBeTruthy()
  })

  const createTenantData = () => ({
    id: faker.string.uuid(),
    apiSecret: faker.string.hexadecimal(),
    idpConsentUrl: faker.internet.url(),
    idpSecret: faker.string.alphanumeric(32)
  })

  describe('tenant', () => {
    describe('create', () => {
      test('creates a new tenant', async () => {
        const tenantData = createTenantData()

        nock(baseUrl).post('/tenant', tenantData).reply(204)

        await expect(client.tenant.create(tenantData)).resolves.toBeUndefined()
      })

      test('throws on bad request', async () => {
        const tenantData = createTenantData()

        nock(baseUrl)
          .post('/tenant', tenantData)
          .reply(409, { message: 'Tenant already exists' })

        await expect(client.tenant.create(tenantData)).rejects.toThrow(
          AuthServiceClientError
        )
      })
    })

    describe('update', () => {
      test('updates an existing tenant', async () => {
        const id = faker.string.uuid()
        const updateData = {
          idpConsentUrl: faker.internet.url(),
          idpSecret: faker.string.alphanumeric(32)
        }

        nock(baseUrl).patch(`/tenant/${id}`, updateData).reply(204)

        await expect(
          client.tenant.update(id, updateData)
        ).resolves.toBeUndefined()
      })

      test('throws on bad request', async () => {
        const id = faker.string.uuid()
        const updateData = {
          idpConsentUrl: faker.internet.url()
        }

        nock(baseUrl)
          .patch(`/tenant/${id}`, updateData)
          .reply(404, { message: 'Tenant not found' })

        await expect(client.tenant.update(id, updateData)).rejects.toThrow(
          AuthServiceClientError
        )
      })
    })

    describe('delete', () => {
      test('deletes an existing tenant', async () => {
        const id = faker.string.uuid()

        nock(baseUrl).delete(`/tenant/${id}`).reply(204)

        await expect(
          client.tenant.delete(id, new Date())
        ).resolves.toBeUndefined()
      })

      test('throws on bad request', async () => {
        const id = faker.string.uuid()

        nock(baseUrl)
          .delete(`/tenant/${id}`)
          .reply(404, { message: 'Tenant not found' })

        await expect(client.tenant.delete(id, new Date())).rejects.toThrow(
          AuthServiceClientError
        )
      })
    })
  })
})
