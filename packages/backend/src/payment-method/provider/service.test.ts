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
import { SepaPaymentService } from '../sepa/service'
import { IlpAddress } from 'ilp-packet'
import base64url from 'base64url'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'

describe('PaymentMethodProviderService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentMethodProviderService: PaymentMethodProviderService
  let streamCredentialsService: StreamCredentialsService
  let sepaPaymentService: SepaPaymentService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)

    paymentMethodProviderService = await deps.use(
      'paymentMethodProviderService'
    )
    streamCredentialsService = await deps.use('streamCredentialsService')
    sepaPaymentService = await deps.use('sepaPaymentService')
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getPaymentMethods', (): void => {
    let incomingPayment: IncomingPayment

    beforeEach(async (): Promise<void> => {
      const asset = await createAsset(deps)
      const walletAddress = await createWalletAddress(deps, {
        assetId: asset.id
      })
      incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })
    })

    test('returns payment methods ILP and SEPA', async (): Promise<void> => {
      const streamCredentialsServiceGetSpy = jest
        .spyOn(streamCredentialsService, 'get')
        .mockImplementationOnce(({ ilpAddress }) => ({
          ilpAddress: ilpAddress as IlpAddress,
          sharedSecret: Buffer.from('secret')
        }))

      const sepaPaymentServiceGetSpy = jest
        .spyOn(sepaPaymentService, 'getSepaDetails')
        .mockResolvedValueOnce(undefined)

      await expect(
        paymentMethodProviderService.getPaymentMethods({
          ...incomingPayment
        } as IncomingPayment)
      ).resolves.toEqual([
        {
          type: 'ilp',
          ilpAddress: 'test.rafiki',
          sharedSecret: base64url(Buffer.from('secret'))
        }
      ])

      expect(streamCredentialsServiceGetSpy).toHaveBeenCalledWith({
        paymentTag: incomingPayment.id,
        ilpAddress: 'test.rafiki',
        asset: {
          code: incomingPayment.asset.code,
          scale: incomingPayment.asset.scale
        }
      })

      expect(sepaPaymentServiceGetSpy).toHaveBeenCalledWith(
        incomingPayment.walletAddressId,
        'sepa'
      )

      //TODO for SEPA
    })

    test('does not return payment methods when failed to generate stream credentials', async (): Promise<void> => {
      const streamCredentialsServiceGetSpy = jest
        .spyOn(streamCredentialsService, 'get')
        .mockImplementationOnce(() => undefined)

      const sepaPaymentServiceGetSpy = jest
        .spyOn(sepaPaymentService, 'getSepaDetails')
        .mockResolvedValueOnce(undefined)

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

      expect(sepaPaymentServiceGetSpy).toHaveBeenCalledWith(
        incomingPayment.walletAddressId,
        'sepa'
      )

      //TODO for SEPA
    })
  })
})
