import { IocContract } from '@adonisjs/fold'

import { v4 as uuid } from 'uuid'

import { DeviceStatus, PosDevice } from './devices/model'
import { PosDeviceService } from './devices/service'
import { Merchant } from './model'
import { MerchantService } from './service'

import { Config } from '../config/app'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'

import { initIocContainer } from '../'
import { AppServices } from '../app'

describe('Merchant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let merchantService: MerchantService
  let posDeviceService: PosDeviceService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config
    })

    appContainer = await createTestApp(deps)
    merchantService = await deps.use('merchantService')
    posDeviceService = await deps.use('posDeviceService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test('creates a merchant', async (): Promise<void> => {
      const merchant = await merchantService.create('Test merchant')
      expect(merchant).toMatchObject({
        name: 'Test merchant',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      })
      expect(typeof merchant.id).toBe('string')
      expect(merchant.deletedAt).toBeUndefined()
    })
  })

  describe('delete', (): void => {
    test('soft deletes an existing merchant', async (): Promise<void> => {
      const created = await merchantService.create('Test merchant')

      const result = await merchantService.delete(created.id)
      expect(result).toBe(true)

      const deletedMerchant = await Merchant.query()
        .findById(created.id)
        .whereNotNull('deletedAt')
      expect(deletedMerchant).toBeDefined()
      expect(deletedMerchant?.deletedAt).toBeDefined()
    })

    test('returns false for already deleted merchant', async (): Promise<void> => {
      const created = await merchantService.create('Test merchant')

      await merchantService.delete(created.id)
      const secondDelete = await merchantService.delete(created.id)
      expect(secondDelete).toBe(false)
    })

    test('soft deletes and revokes associated devices when deleting merchant', async (): Promise<void> => {
      const knex = await deps.use('knex')
      const created = await merchantService.create('Test merchant')

      const device1Result = await posDeviceService.registerDevice({
        merchantId: created.id,
        walletAddress: 'wallet1',
        algorithm: 'ecdsa-p256-sha256',
        deviceName: 'Device 1',
        publicKey: 'test-public-key-1'
      })

      const device2Result = await posDeviceService.registerDevice({
        merchantId: created.id,
        walletAddress: 'wallet2',
        algorithm: 'ecdsa-p256-sha256',
        deviceName: 'Device 2',
        publicKey: 'test-public-key-2'
      })

      expect(device1Result.status).toBe(DeviceStatus.Active)
      expect(device2Result.status).toBe(DeviceStatus.Active)

      const result = await merchantService.delete(created.id)
      expect(result).toBe(true)

      const deletedMerchant = await Merchant.query(knex)
        .findById(created.id)
        .whereNotNull('deletedAt')
      expect(deletedMerchant).toBeDefined()
      expect(deletedMerchant?.deletedAt).toBeDefined()

      const deletedDevices = await PosDevice.query(knex)
        .where('merchantId', created.id)
        .whereNotNull('deletedAt')

      expect(deletedDevices).toHaveLength(2)
      expect(deletedDevices[0].status).toBe(DeviceStatus.Revoked)
      expect(deletedDevices[0].deletedAt).toBeDefined()
      expect(deletedDevices[1].status).toBe(DeviceStatus.Revoked)
      expect(deletedDevices[1].deletedAt).toBeDefined()
    })

    test('returns false for non-existent merchant', async (): Promise<void> => {
      const result = await merchantService.delete(uuid())
      expect(result).toBe(false)
    })
  })
})
