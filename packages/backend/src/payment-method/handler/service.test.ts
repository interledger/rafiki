import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'
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
import { createTenant } from '../../tests/tenant'
import { EndpointType } from '../../tenant/endpoints/model'

const nock = (global as unknown as { nock: typeof import('nock') }).nock

describe('PaymentMethodHandlerService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentMethodHandlerService: PaymentMethodHandlerService
  let ilpPaymentService: IlpPaymentService
  let tenantId: string

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)

    paymentMethodHandlerService = await deps.use('paymentMethodHandlerService')
    ilpPaymentService = await deps.use('ilpPaymentService')
  })

  beforeEach(async (): Promise<void> => {
    const config = await deps.use('config')
    const tenantEmail = faker.internet.email()
    nock(config.kratosAdminUrl)
      .get('/identities')
      .query({ credentials_identifier: tenantEmail })
      .reply(200, [{ id: uuid(), metadata_public: {} }])
      .persist()
    tenantId = (
      await createTenant(deps, {
        email: tenantEmail,
        idpSecret: 'testsecret',
        idpConsentEndpoint: faker.internet.url(),
        endpoints: [
          { type: EndpointType.WebhookBaseUrl, value: faker.internet.url() }
        ]
      })
    ).id
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
      const walletAddress = await createWalletAddress(deps, tenantId, {
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
      const walletAddress = await createWalletAddress(deps, tenantId, {
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
  })
})
