import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { Config } from '../../config/app'
import { CreateOptions, PosDeviceService } from './service'
import { initIocContainer } from '../..'
import { PosDeviceError, isPosDeviceError } from './errors'
import { v4 as uuid } from 'uuid'
import { TestContainer, createTestApp } from '../../tests/app'
import { truncateTables } from '../../tests/tableManager'
import { MerchantService } from '../service'
import { DeviceStatus, PosDevice } from './model'
import assert from 'assert'

describe('POS Device Service', () => {
  let deps: IocContract<AppServices>
  let posDeviceService: PosDeviceService
  let merchantService: MerchantService
  let appContainer: TestContainer

  beforeAll(async () => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    posDeviceService = await deps.use('posDeviceService')
    merchantService = await deps.use('merchantService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', () => {
    test('device can be created and fetched', async () => {
      const merchant = await merchantService.create('merchant')
      const createOptions: CreateOptions = {
        merchantId: merchant.id,
        publicKey: 'publicKey',
        deviceName: 'device',
        walletAddress: 'walletAddress',
        algorithm: 'ecdsa-p256-sha256'
      }

      const device = await posDeviceService.registerDevice(createOptions)
      assert(!isPosDeviceError(device))
      expect(device).toMatchObject({
        merchantId: merchant.id,
        publicKey: 'publicKey',
        deviceName: 'device',
        walletAddress: 'walletAddress',
        algorithm: 'ecdsa-p256-sha256',
        keyId: expect.stringMatching(/^pos:device[a-zA-Z0-9-]{6}$/)
      })
    })

    test('returns error if merchant does not exist', async () => {
      const createOptions: CreateOptions = {
        merchantId: uuid(),
        publicKey: 'publicKey',
        deviceName: 'device',
        walletAddress: 'walletAddress',
        algorithm: 'ecdsa-p256-sha256'
      }

      const device = await posDeviceService.registerDevice(createOptions)
      assert(isPosDeviceError(device))
      expect(device).toBe(PosDeviceError.UnknownMerchant)
    })
  })

  describe('getByKeyId', () => {
    test('returns device by keyId', async () => {
      const createdDevice = await createDeviceWithMerchant()
      const foundDevice = await posDeviceService.getByKeyId(createdDevice.keyId)
      expect(foundDevice).toBeDefined()
    })

    test('returns undefined when no device with the given keyId exists', async () => {
      const foundDevice = await posDeviceService.getByKeyId(uuid())
      expect(foundDevice).toBeUndefined()
    })
  })

  describe('revoke', () => {
    test('returns device with revoked status', async () => {
      const createdDevice = await createDeviceWithMerchant()
      expect(createdDevice).toMatchObject({
        status: DeviceStatus.Active,
        deletedAt: null
      })
      const revokedDevice = await posDeviceService.revoke(createdDevice.id)
      assert(!isPosDeviceError(revokedDevice))
      expect(revokedDevice).toMatchObject({
        status: DeviceStatus.Revoked,
        deletedAt: expect.any(Date)
      })

      // Checking if it was deleted recently
      assert(revokedDevice.deletedAt)
      expect(
        Math.abs(revokedDevice.deletedAt.getTime() - new Date().getTime())
      ).toBeLessThan(5000)
    })

    test('returns error when there is no device with the given id', async () => {
      await createDeviceWithMerchant()
      const revokedDevice = await posDeviceService.revoke(uuid())
      assert(isPosDeviceError(revokedDevice))
      expect(revokedDevice).toBe(PosDeviceError.UnknownPosDevice)
    })
  })

  describe('revokeAllByMerchantId', () => {
    test('revokes all devices for a merchant', async () => {
      const merchant = await merchantService.create('Test Merchant')

      const device1 = await posDeviceService.registerDevice({
        merchantId: merchant.id,
        publicKey: 'publicKey1',
        deviceName: 'device1',
        walletAddress: 'walletAddress1',
        algorithm: 'ecdsa-p256-sha256'
      })

      const device2 = await posDeviceService.registerDevice({
        merchantId: merchant.id,
        publicKey: 'publicKey2',
        deviceName: 'device2',
        walletAddress: 'walletAddress2',
        algorithm: 'ecdsa-p256-sha256'
      })

      assert(!isPosDeviceError(device1))
      assert(!isPosDeviceError(device2))
      expect(device1.status).toBe(DeviceStatus.Active)
      expect(device2.status).toBe(DeviceStatus.Active)

      const revokedCount = await posDeviceService.revokeAllByMerchantId(
        merchant.id
      )
      expect(revokedCount).toBe(2)

      const knex = await deps.use('knex')
      const revokedDevices = await PosDevice.query(knex)
        .where('merchantId', merchant.id)
        .whereNotNull('deletedAt')

      expect(revokedDevices).toHaveLength(2)
      expect(revokedDevices[0].status).toBe(DeviceStatus.Revoked)
      expect(revokedDevices[0].deletedAt).toBeDefined()
      expect(revokedDevices[1].status).toBe(DeviceStatus.Revoked)
      expect(revokedDevices[1].deletedAt).toBeDefined()
    })

    test('returns 0 when no devices exist for merchant', async () => {
      const merchant = await merchantService.create('Test Merchant')
      const revokedCount = await posDeviceService.revokeAllByMerchantId(
        merchant.id
      )
      expect(revokedCount).toBe(0)
    })

    test('returns 0 when all devices are already revoked', async () => {
      const merchant = await merchantService.create('Test Merchant')

      const device = await posDeviceService.registerDevice({
        merchantId: merchant.id,
        publicKey: 'publicKey',
        deviceName: 'device',
        walletAddress: 'walletAddress',
        algorithm: 'ecdsa-p256-sha256'
      })

      assert(!isPosDeviceError(device))

      await posDeviceService.revoke(device.id)

      const revokedCount = await posDeviceService.revokeAllByMerchantId(
        merchant.id
      )
      expect(revokedCount).toBe(0)
    })
  })

  async function createDeviceWithMerchant(): Promise<PosDevice> {
    const merchant = await merchantService.create('merchant')
    const createOptions: CreateOptions = {
      merchantId: merchant.id,
      publicKey: 'publicKey',
      deviceName: 'device',
      walletAddress: 'walletAddress',
      algorithm: 'ecdsa-p256-sha256'
    }

    const device = await posDeviceService.registerDevice(createOptions)
    assert(!isPosDeviceError(device))
    return device
  }
})
