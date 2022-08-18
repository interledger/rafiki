import { Knex } from 'knex'
import { ApiKeyService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { createPaymentPointer } from '../tests/paymentPointer'
import { PaymentPointer } from '../open_payments/payment_pointer/model'
import bcrypt from 'bcrypt'
import { ApiKeyError, isApiKeyError } from './errors'

describe('Api Key Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let apiKeyService: ApiKeyService
  let paymentPointer: PaymentPointer
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    apiKeyService = await deps.use('apiKeyService')
  })

  beforeEach(async (): Promise<void> => {
    paymentPointer = await createPaymentPointer(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create / Get Api Key', (): void => {
    test('An api key can be created/fetched for a certain payment pointer', async (): Promise<void> => {
      const apiKeyOptions = { paymentPointerId: paymentPointer.id }
      const apiKey = await apiKeyService.create(apiKeyOptions)
      expect(apiKey.key).toBeDefined()
      expect(apiKey.hashedKey).toBeDefined()
      expect(apiKey.paymentPointerId).toEqual(paymentPointer.id)
      expect(apiKey.createdAt).toBeDefined()
      expect(apiKey.updatedAt).toBeDefined()
      const match = await bcrypt.compare(apiKey.key, apiKey.hashedKey)
      expect(match).toBe(true)

      const fetchedKeys = await apiKeyService.get(apiKeyOptions)
      expect(fetchedKeys.length).toEqual(1)
      expect(fetchedKeys[0].hashedKey).toEqual(apiKey.hashedKey)
      expect(fetchedKeys[0].paymentPointerId).toEqual(apiKey.paymentPointerId)
      expect(fetchedKeys[0].createdAt).toEqual(apiKey.createdAt)
      expect(fetchedKeys[0].updatedAt).toEqual(apiKey.updatedAt)
      expect(fetchedKeys[0]).not.toHaveProperty('key')
    })
  })

  describe('Redeem Api Key for Session Key', (): void => {
    test('A valid api key can be redeemed for a session key', async (): Promise<void> => {
      const apiKey = await apiKeyService.create({
        paymentPointerId: paymentPointer.id
      })
      const sessionKeyOrError = await apiKeyService.redeem({
        paymentPointerId: paymentPointer.id,
        key: apiKey.key
      })
      expect(isApiKeyError(sessionKeyOrError)).toEqual(false)
      if (isApiKeyError(sessionKeyOrError)) {
        fail()
      } else {
        expect(sessionKeyOrError.key).toBeDefined()
      }
    })

    test('A session key cannot be acquired if no api key for payment pointer exists', async (): Promise<void> => {
      const sessionKeyOrError = apiKeyService.redeem({
        paymentPointerId: paymentPointer.id,
        key: '123'
      })
      expect(sessionKeyOrError).resolves.toEqual(ApiKeyError.UnknownApiKey)
    })

    test('A session key cannot be acquired if api key is unknown', async (): Promise<void> => {
      await apiKeyService.create({ paymentPointerId: paymentPointer.id })
      const sessionKeyOrError = apiKeyService.redeem({
        paymentPointerId: paymentPointer.id,
        key: '123'
      })
      expect(sessionKeyOrError).resolves.toEqual(ApiKeyError.UnknownApiKey)
    })
  })

  describe('Delete Api Key', (): void => {
    test('All api keys for an payment pointer can be deleted', async (): Promise<void> => {
      const apiKeyOptions = { paymentPointerId: paymentPointer.id }
      await apiKeyService.create(apiKeyOptions)
      await apiKeyService.create(apiKeyOptions)
      await apiKeyService.deleteAll(apiKeyOptions)
      const fetchedKeys = await apiKeyService.get(apiKeyOptions)
      expect(fetchedKeys).toEqual([])
    })
  })
})
