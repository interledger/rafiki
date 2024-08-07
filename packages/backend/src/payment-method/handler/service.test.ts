import {
  PaymentMethodHandlerService,
  PayOptions,
  StartQuoteOptions
} from './service'
import { initIocContainer } from '../../'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { createAsset } from '../../tests/asset'
import { createWalletAddress } from '../../tests/walletAddress'

import { createReceiver } from '../../tests/receiver'
import { IlpPaymentService } from '../ilp/service'
import { truncateTables } from '../../tests/tableManager'
import { createOutgoingPaymentWithReceiver } from '../../tests/outgoingPayment'
import { TelemetryService } from '../../telemetry/service'

describe('PaymentMethodHandlerService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentMethodHandlerService: PaymentMethodHandlerService
  let ilpPaymentService: IlpPaymentService
  let telemetryService: TelemetryService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer({
      ...Config,
      enableTelemetry: true
    })
    appContainer = await createTestApp(deps)

    paymentMethodHandlerService = await deps.use('paymentMethodHandlerService')
    ilpPaymentService = await deps.use('ilpPaymentService')
    telemetryService = await deps.use('telemetry')!
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
      const walletAddress = await createWalletAddress(deps, {
        assetId: asset.id
      })

      const options: StartQuoteOptions = {
        walletAddress,
        receiver: await createReceiver(deps, walletAddress),
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 100n
        }
      }

      const ilpPaymentServiceGetQuoteSpy = jest
        .spyOn(ilpPaymentService, 'getQuote')
        .mockImplementationOnce(jest.fn())

      await paymentMethodHandlerService.getQuote('ILP', options)

      expect(ilpPaymentServiceGetQuoteSpy).toHaveBeenCalledWith(options)
    })
  })

  describe('pay', (): void => {
    test('calls ilpPaymentService for ILP payment type', async (): Promise<void> => {
      const asset = await createAsset(deps)
      const walletAddress = await createWalletAddress(deps, {
        assetId: asset.id
      })
      const { receiver, outgoingPayment } =
        await createOutgoingPaymentWithReceiver(deps, {
          sendingWalletAddress: walletAddress,
          receivingWalletAddress: walletAddress,
          method: 'ilp',
          quoteOptions: {
            debitAmount: {
              assetCode: walletAddress.asset.code,
              assetScale: walletAddress.asset.scale,
              value: 100n
            }
          }
        })

      const options: PayOptions = {
        receiver,
        outgoingPayment,
        finalDebitAmount: outgoingPayment.debitAmount.value,
        finalReceiveAmount: outgoingPayment.receiveAmount.value
      }

      const ilpPaymentServicePaySpy = jest
        .spyOn(ilpPaymentService, 'pay')
        .mockImplementationOnce(jest.fn())

      await paymentMethodHandlerService.pay('ILP', options)

      expect(ilpPaymentServicePaySpy).toHaveBeenCalledWith(options)
    })
    test('telemetry packet counts and amounts are collected when making a payment', async (): Promise<void> => {
      const incrementAmountSpy = jest
        .spyOn(telemetryService!, 'incrementCounterWithTransactionAmount')
        .mockImplementation(() => Promise.resolve())

      const incrementCounterSpy = jest
        .spyOn(telemetryService!, 'incrementCounter')
        .mockImplementation(() => Promise.resolve())
      const asset = await createAsset(deps)
      const walletAddress = await createWalletAddress(deps, {
        assetId: asset.id
      })
      const { receiver, outgoingPayment } =
        await createOutgoingPaymentWithReceiver(deps, {
          sendingWalletAddress: walletAddress,
          receivingWalletAddress: walletAddress,
          method: 'ilp',
          quoteOptions: {
            debitAmount: {
              assetCode: walletAddress.asset.code,
              assetScale: walletAddress.asset.scale,
              value: 100n
            }
          }
        })

      const options: PayOptions = {
        receiver,
        outgoingPayment,
        finalDebitAmount: outgoingPayment.debitAmount.value,
        finalReceiveAmount: outgoingPayment.receiveAmount.value
      }

      await paymentMethodHandlerService.pay('ILP', options)

      expect(incrementAmountSpy).toHaveBeenCalledTimes(1)
      expect(incrementCounterSpy).toHaveBeenCalledTimes(2) // once for prepare and once for fulfill
    })
  })
})
