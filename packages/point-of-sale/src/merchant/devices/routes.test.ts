import { IocContract } from '@adonisjs/fold'
import { v4 as uuid } from 'uuid'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { Config } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'
import { truncateTables } from '../../tests/tableManager'
import { MerchantService } from '../service'
import {
  CreateBody,
  createPosDeviceRoutes,
  PosDeviceRoutes,
  RegisterDeviceContext,
  RevokeDeviceContext
} from './routes'
import { PosDeviceService } from './service'
import { faker } from '@faker-js/faker'

describe('POS Device Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let posDeviceRoutes: PosDeviceRoutes
  let posDeviceService: PosDeviceService
  let merchantService: MerchantService

  const CREATE_BODY: CreateBody = {
    publicKey: 'public-key',
    deviceName: 'Supermarket Store POS',
    walletAddress: `https://${faker.internet.domainName()}`,
    algorithm: 'ecdsa-p256-sha256'
  }

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    posDeviceService = await deps.use('posDeviceService')
    merchantService = await deps.use('merchantService')
    const logger = await deps.use('logger')
    const knex = await deps.use('knex')

    posDeviceRoutes = createPosDeviceRoutes({
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

      await posDeviceRoutes.revoke(ctx)

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

      await expect(posDeviceRoutes.revoke(ctx)).rejects.toThrow(
        'Device not found'
      )
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

      await expect(posDeviceRoutes.revoke(ctx)).rejects.toThrow(
        'Device not found'
      )
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

      await expect(posDeviceRoutes.revoke(ctx)).rejects.toThrow(
        'Device not found'
      )
    })
  })

  describe('create', () => {
    test('returns the keyId and algorithm of the device on success', async () => {
      const { id: merchantId } = await merchantService.create('Merchant')
      const ctx = createContext<RegisterDeviceContext>({
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      })
      ctx.request.body = CREATE_BODY
      ctx.params.merchantId = merchantId
      await posDeviceRoutes.register(ctx)

      expect(ctx.response.status).toBe(201)
      expect(ctx.response.body).toMatchObject({
        keyId: expect.stringMatching(/^pos:Superm[a-zA-Z0-9-]{6}$/),
        algorithm: 'ecdsa-p256-sha256'
      })
    })

    test('throws error when merchant does not exist', async () => {
      const ctx = createContext<RegisterDeviceContext>({
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      })
      ctx.request.body = CREATE_BODY
      ctx.params.merchantId = uuid()
      await expect(posDeviceRoutes.register(ctx)).rejects.toThrow(
        'Unknown merchant'
      )
    })
  })
})
