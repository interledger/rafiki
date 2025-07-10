import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { TestContainer, createTestApp } from '../../tests/app'
import { Config } from '../../config/app'
import { initIocContainer } from '../..'
import {
  CreateBody,
  PosDeviceRoutes,
  RegisterDeviceContext,
  createPosDeviceRoutes
} from './routes'
import { truncateTables } from '../../tests/tableManager'
import { createContext } from '../../tests/context'
import { faker } from '@faker-js/faker'
import { MerchantService } from '../service'
import { v4 as uuid } from 'uuid'
import { PosDeviceError, errorToMessage } from './errors'

describe('POS Device Routes', () => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let posDeviceRoutes: PosDeviceRoutes
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
    merchantService = await deps.use('merchantService')
    const logger = await deps.use('logger')
    const posDeviceService = await deps.use('posDeviceService')
    posDeviceRoutes = createPosDeviceRoutes({
      logger,
      posDeviceService
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
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
      await expect(posDeviceRoutes.register(ctx)).rejects.toMatchObject({
        status: 400,
        message: errorToMessage[PosDeviceError.UnknownMerchant]
      })
    })

    function createContextWithMerchantId(merchantId: string) {}
  })
})
