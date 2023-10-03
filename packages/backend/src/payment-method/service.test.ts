import {
  PaymentMethod,
  PaymentMethodManagerService,
  StartQuoteOptions
} from './service'
import { initIocContainer } from '../'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { createAsset } from '../tests/asset'
import { createPaymentPointer } from '../tests/paymentPointer'

import { createReceiver } from '../tests/receiver'
import { IlpPaymentService } from './ilp/service'
import { truncateTables } from '../tests/tableManager'

describe('PaymentMethodManagerService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentMethodManagerService: PaymentMethodManagerService
  let ilpPaymentService: IlpPaymentService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)

    paymentMethodManagerService = await deps.use('paymentMethodManagerService')
    ilpPaymentService = await deps.use('ilpPaymentService')
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getQuote', (): void => {
    test('calls ilpPaymentService for ILP payment type', async (): Promise<void> => {
      const asset = await createAsset(deps)
      const paymentPointer = await createPaymentPointer(deps, {
        assetId: asset.id
      })

      const options: StartQuoteOptions = {
        paymentPointer,
        receiver: await createReceiver(deps, paymentPointer),
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 100n
        }
      }

      const ilpPaymentServiceGetQuoteSpy = jest.spyOn(
        ilpPaymentService,
        'getQuote'
      )

      await paymentMethodManagerService.getQuote('ILP', options)

      expect(ilpPaymentServiceGetQuoteSpy).toHaveBeenCalledWith(options)
    })

    test('throws if invalid payment method', async (): Promise<void> => {
      const asset = await createAsset(deps, {
        code: 'USD',
        scale: 2
      })

      const paymentPointer = await createPaymentPointer(deps, {
        assetId: asset.id
      })

      const options: StartQuoteOptions = {
        paymentPointer,
        receiver: await createReceiver(deps, paymentPointer),
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 100n
        }
      }

      expect(() =>
        paymentMethodManagerService.getQuote('' as PaymentMethod, options)
      ).toThrow('Payment method not supported')
    })
  })
})
