import {
  createOutgoingPaymentRoutes,
  getOutgoingPayment,
  validateOutgoingPayment
} from './outgoing-payment'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import config from '../config'
import {
  defaultAxiosInstance,
  mockOutgoingPayment,
  mockOpenApiResponseValidators,
  silentLogger
} from '../test/helpers'
import nock from 'nock'

describe('outgoing-payment', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_RS_OPEN_API_URL)
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger
  const baseUrl = 'http://localhost:1000'
  const openApiValidators = mockOpenApiResponseValidators()

  describe('createOutgoingPaymentRoutes', (): void => {
    test('creates getOutgoingPaymentOpenApiValidator properly', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createOutgoingPaymentRoutes({
        axiosInstance,
        openApi,
        logger
      })
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/outgoing-payments/{id}',
        method: HttpMethod.GET
      })
    })
  })

  describe('getOutgoingPayment', (): void => {
    test('returns outgoing payment if passes validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment()

      nock(baseUrl).get('/outgoing-payment').reply(200, outgoingPayment)

      const result = await getOutgoingPayment(
        {
          axiosInstance,
          logger
        },
        {
          url: `${baseUrl}/outgoing-payment`,
          accessToken: 'accessToken'
        },
        openApiValidators.successfulValidator
      )
      expect(result).toStrictEqual(outgoingPayment)
    })

    test('throws if outgoing payment does not pass validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        sendAmount: {
          assetCode: 'USD',
          assetScale: 3,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '0'
        }
      })

      nock(baseUrl).get('/outgoing-payment').reply(200, outgoingPayment)

      await expect(() =>
        getOutgoingPayment(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/outgoing-payment`,
            accessToken: 'accessToken'
          },
          openApiValidators.successfulValidator
        )
      ).rejects.toThrowError()
    })
  })

  describe('validateOutgoingPayment', (): void => {
    test('returns outgoing payment if passes validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        receiveAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        sendAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '0'
        }
      })

      expect(validateOutgoingPayment(outgoingPayment)).toStrictEqual(
        outgoingPayment
      )
    })

    test('throws if send amount and sent amount asset scales are different', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        sendAmount: {
          assetCode: 'USD',
          assetScale: 3,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '0'
        }
      })

      expect(() => validateOutgoingPayment(outgoingPayment)).toThrow(
        'Asset code or asset scale of sending amount does not match up sent amount'
      )
    })

    test('throws if send amount and sent amount asset codes are different', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        sendAmount: {
          assetCode: 'CAD',
          assetScale: 2,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '0'
        }
      })

      expect(() => validateOutgoingPayment(outgoingPayment)).toThrow(
        'Asset code or asset scale of sending amount does not match up sent amount'
      )
    })

    test('throws if sent amount is larger than send amount', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        sendAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '6'
        }
      })

      expect(() => validateOutgoingPayment(outgoingPayment)).toThrow(
        'Amount sent is larger than maximum amount to send'
      )
    })

    test('throws if sent amount equals send amount, but payment has failed', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        sendAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        sentAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        failed: true
      })

      expect(() => validateOutgoingPayment(outgoingPayment)).toThrow(
        'Amount to send matches sent amount but payment failed'
      )
    })
  })
})
