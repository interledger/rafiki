import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { TestContainer, createTestApp } from '../../tests/app'
import { Config, IAppConfig } from '../../config/app'
import { initIocContainer } from '../..'
import { CreateBody, PosDeviceRoutes, RegisterDeviceContext } from './routes'
import { truncateTables } from '../../tests/tableManager'
import { createContext } from '../../tests/context'
import { faker } from '@faker-js/faker'
import { MerchantService } from '../service'
import { v4 as uuid } from 'uuid'
import { PosDeviceError, errorToMessage } from './errors'

describe('POS Device Routes', () => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let config: IAppConfig
  let posDeviceRoutes: PosDeviceRoutes
  let merchantService: MerchantService
  let merchantId: string

  const CREATE_BODY: CreateBody = {
    publicKey: 'public-key',
    deviceName: 'Supermarket Store POS',
    walletAddress: `https://${faker.internet.domainName()}`,
    algorithm: 'ecdsa-p256-sha256'
  }

  beforeAll(async (): Promise<void> => {
    config = Config
    deps = initIocContainer(config)
    appContainer = await createTestApp(deps)
    config = await deps.use('config')
    posDeviceRoutes = await deps.use('posDeviceRoutes')
    merchantService = await deps.use('merchantService')
  })

  beforeEach(async () => {
    merchantId = (await createMerchant()).id
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', () => {
    test('returns the keyId and algorithm of the device on success', async () => {
      const ctx = createContextWithMerchantId()

      await posDeviceRoutes.register(ctx)

      expect(ctx.response.status).toBe(201)
      expect(ctx.response.body).toMatchObject({
        keyId: expect.stringMatching(/^pos:Superm[a-zA-Z0-9-]{6}$/),
        algorithm: 'ecdsa-p256-sha256'
      })
    })

    test('throws error when merchant does not exist', async () => {
      const ctx = createContextWithMerchantId(uuid())

      await expect(posDeviceRoutes.register(ctx)).rejects.toMatchObject({
        status: 400,
        message: errorToMessage[PosDeviceError.UnknownMerchant]
      })
    })

    function createContextWithMerchantId(withMerchantId?: string) {
      const ctx = createContext<RegisterDeviceContext>({
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      })
      ctx.request.body = CREATE_BODY
      ctx.params.merchantId = withMerchantId ?? merchantId
      return ctx
    }
  })

  async function createMerchant(name?: string) {
    return await merchantService.create(name ?? 'Merchant')
  }
})
