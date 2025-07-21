import { IocContract } from '@adonisjs/fold'
import { v4 as uuid } from 'uuid'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { Config } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'
import { truncateTables } from '../../tests/tableManager'
import { MerchantService } from '../service'
import { createDeviceRoutes, DeviceRoutes, RevokeDeviceContext } from './routes'
import { PosDeviceService } from './service'

describe('Device Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let deviceRoutes: DeviceRoutes
  let posDeviceService: PosDeviceService
  let merchantService: MerchantService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    posDeviceService = await deps.use('posDeviceService')
    merchantService = await deps.use('merchantService')
    const logger = await deps.use('logger')
    const knex = await deps.use('knex')

    deviceRoutes = createDeviceRoutes({
      posDeviceService,
      knex,
      logger
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('revoke', (): void => {
    test('Revokes a device successfully', async (): Promise<void> => {
      const merchant = await merchantService.create('Test Merchant')

      const device = await posDeviceService.registerDevice({
        merchantId: merchant.id,
        publicKey: 'test-public-key',
        deviceName: 'Test Device',
        walletAddress: 'https://wallet.example.com',
        algorithm: 'ecdsa-p256-sha256'
      })

      const ctx = createContext<RevokeDeviceContext>(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {}
      )
      ctx.request.params = {
        merchantId: merchant.id,
        deviceId: device.id
      }

      await deviceRoutes.revoke(ctx)

      expect(ctx.status).toBe(204)
    })

    test('Returns 404 for non-existent device', async (): Promise<void> => {
      const merchant = await merchantService.create('Test Merchant')

      const ctx = createContext<RevokeDeviceContext>(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {}
      )
      ctx.request.params = {
        merchantId: merchant.id,
        deviceId: uuid()
      }

      await expect(deviceRoutes.revoke(ctx)).rejects.toThrow('Device not found')
    })

    test('Returns 404 for device that belongs to different merchant', async (): Promise<void> => {
      const merchant1 = await merchantService.create('Test Merchant 1')
      const merchant2 = await merchantService.create('Test Merchant 2')

      const device = await posDeviceService.registerDevice({
        merchantId: merchant1.id,
        publicKey: 'test-public-key',
        deviceName: 'Test Device',
        walletAddress: 'https://wallet.example.com',
        algorithm: 'ecdsa-p256-sha256'
      })

      const ctx = createContext<RevokeDeviceContext>(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {}
      )
      ctx.request.params = {
        merchantId: merchant2.id,
        deviceId: device.id
      }

      await expect(deviceRoutes.revoke(ctx)).rejects.toThrow('Device not found')
    })

    test('Returns 404 for already deleted device', async (): Promise<void> => {
      const merchant = await merchantService.create('Test Merchant')

      const device = await posDeviceService.registerDevice({
        merchantId: merchant.id,
        publicKey: 'test-public-key',
        deviceName: 'Test Device',
        walletAddress: 'https://wallet.example.com',
        algorithm: 'ecdsa-p256-sha256'
      })

      await posDeviceService.revoke(device.id)

      const ctx = createContext<RevokeDeviceContext>(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {}
      )
      ctx.request.params = {
        merchantId: merchant.id,
        deviceId: device.id
      }

      await expect(deviceRoutes.revoke(ctx)).rejects.toThrow('Device not found')
    })
  })
})
