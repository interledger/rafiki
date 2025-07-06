import { PaymentMethodProviderService } from './service'
import { initIocContainer } from '../../'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { createAsset } from '../../tests/asset'
import { createWalletAddress } from '../../tests/walletAddress'

import { truncateTables } from '../../tests/tableManager'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { StreamCredentialsService } from '../ilp/stream-credentials/service'
import { IlpAddress } from 'ilp-packet'
import base64url from 'base64url'
import { TenantSettingService } from '../../tenants/settings/service'
import { TenantSetting, TenantSettingKeys } from '../../tenants/settings/model'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'

describe('PaymentMethodProviderService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentMethodProviderService: PaymentMethodProviderService
  let streamCredentialsService: StreamCredentialsService
  let tenantSettingService: TenantSettingService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)

    paymentMethodProviderService = await deps.use(
      'paymentMethodProviderService'
    )
    streamCredentialsService = await deps.use('streamCredentialsService')
    tenantSettingService = await deps.use('tenantSettingService')
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getPaymentMethods', (): void => {
    const tenantId = Config.operatorTenantId
    let incomingPayment: IncomingPayment

    beforeEach(async (): Promise<void> => {
      const asset = await createAsset(deps)
      const walletAddress = await createWalletAddress(deps, {
        tenantId,
        assetId: asset.id
      })
      incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        tenantId: Config.operatorTenantId
      })
    })
    test('returns payment methods with ILP payment method for operator tenant', async (): Promise<void> => {
      const tenantSettingsServiceGetSpy = jest.spyOn(
        tenantSettingService,
        'get'
      )

      const streamCredentialsServiceGetSpy = jest
        .spyOn(streamCredentialsService, 'get')
        .mockImplementationOnce(({ ilpAddress }) => ({
          ilpAddress: ilpAddress as IlpAddress,
          sharedSecret: Buffer.from('secret')
        }))

      await expect(
        paymentMethodProviderService.getPaymentMethods(incomingPayment)
      ).resolves.toEqual([
        {
          type: 'ilp',
          ilpAddress: 'test.rafiki',
          sharedSecret: base64url(Buffer.from('secret'))
        }
      ])

      expect(tenantSettingsServiceGetSpy).not.toHaveBeenCalled()
      expect(streamCredentialsServiceGetSpy).toHaveBeenCalledWith({
        paymentTag: incomingPayment.id,
        ilpAddress: 'test.rafiki',
        asset: {
          code: incomingPayment.asset.code,
          scale: incomingPayment.asset.scale
        }
      })
    })

    test('returns payment methods with ILP payment method for non-operator tenant', async (): Promise<void> => {
      const tenantId = crypto.randomUUID()
      const tenantSettingsServiceGetSpy = jest
        .spyOn(tenantSettingService, 'get')
        .mockResolvedValueOnce([
          {
            tenantId,
            key: TenantSettingKeys.ILP_ADDRESS.name,
            value: 'test.rafiki'
          }
        ] as TenantSetting[])

      const streamCredentialsServiceGetSpy = jest
        .spyOn(streamCredentialsService, 'get')
        .mockImplementationOnce(({ ilpAddress }) => ({
          ilpAddress: ilpAddress as IlpAddress,
          sharedSecret: Buffer.from('secret')
        }))

      await expect(
        paymentMethodProviderService.getPaymentMethods({
          ...incomingPayment,
          tenantId
        } as IncomingPayment)
      ).resolves.toEqual([
        {
          type: 'ilp',
          ilpAddress: 'test.rafiki',
          sharedSecret: base64url(Buffer.from('secret'))
        }
      ])

      expect(tenantSettingsServiceGetSpy).toHaveBeenCalledWith({
        tenantId: tenantId,
        key: TenantSettingKeys.ILP_ADDRESS.name
      })
      expect(streamCredentialsServiceGetSpy).toHaveBeenCalledWith({
        paymentTag: incomingPayment.id,
        ilpAddress: 'test.rafiki',
        asset: {
          code: incomingPayment.asset.code,
          scale: incomingPayment.asset.scale
        }
      })
    })

    test('does not return ILP payment method when missing ILP address in tenant settings for non-operator tenant', async (): Promise<void> => {
      const tenantId = crypto.randomUUID()
      const tenantSettingsServiceGetSpy = jest
        .spyOn(tenantSettingService, 'get')
        .mockResolvedValueOnce([])

      await expect(
        paymentMethodProviderService.getPaymentMethods({
          ...incomingPayment,
          tenantId
        } as IncomingPayment)
      ).resolves.toEqual([])

      expect(tenantSettingsServiceGetSpy).toHaveBeenCalledWith({
        tenantId,
        key: TenantSettingKeys.ILP_ADDRESS.name
      })
    })

    test('does not return ILP payment method when failed to generate stream credentials', async (): Promise<void> => {
      const streamCredentialsServiceGetSpy = jest
        .spyOn(streamCredentialsService, 'get')
        .mockImplementationOnce(() => undefined)

      await expect(
        paymentMethodProviderService.getPaymentMethods(incomingPayment)
      ).resolves.toEqual([])

      expect(streamCredentialsServiceGetSpy).toHaveBeenCalledWith({
        paymentTag: incomingPayment.id,
        ilpAddress: 'test.rafiki',
        asset: {
          code: incomingPayment.asset.code,
          scale: incomingPayment.asset.scale
        }
      })
    })
  })
})
