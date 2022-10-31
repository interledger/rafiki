import {
  createIncomingPaymentRoutes,
  getIncomingPayment,
  validateIncomingPayment
} from './incoming-payment'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import config from '../config'
import {
  defaultAxiosInstance,
  mockILPStreamConnection,
  mockIncomingPayment,
  mockOpenApiResponseValidators,
  silentLogger
} from '../test/helpers'
import nock from 'nock'

describe('incoming-payment', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_OPEN_API_URL)
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger
  const baseUrl = 'http://localhost:1000'
  const openApiValidators = mockOpenApiResponseValidators()

  describe('createIncomingPaymentRoutes', (): void => {
    test('creates getIncomingPaymentOpenApiValidator properly', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createIncomingPaymentRoutes({
        axiosInstance,
        openApi,
        logger
      })
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/incoming-payments/{id}',
        method: HttpMethod.GET
      })
    })
  })

  describe('getIncomingPayment', (): void => {
    test('returns incoming payment if passes validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment()

      nock(baseUrl).get('/incoming-payment').reply(200, incomingPayment)

      const result = await getIncomingPayment(
        {
          axiosInstance,
          logger
        },
        {
          url: `${baseUrl}/incoming-payment`,
          accessToken: 'accessToken'
        },
        openApiValidators.successfulValidator
      )
      expect(result).toStrictEqual(incomingPayment)
    })

    test('throws if incoming payment does not pass validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '10'
        }
      })

      nock(baseUrl).get('/incoming-payment').reply(200, incomingPayment)

      await expect(() =>
        getIncomingPayment(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/incoming-payment`,
            accessToken: 'accessToken'
          },
          openApiValidators.successfulValidator
        )
      ).rejects.toThrowError()
    })
  })

  describe('validateIncomingPayment', (): void => {
    test('returns incoming payment if passes validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        completed: true
      })

      expect(validateIncomingPayment(incomingPayment)).toStrictEqual(
        incomingPayment
      )
    })

    test('throws if receiving and incoming amount asset scales are different', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 1,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        }
      })

      expect(() => validateIncomingPayment(incomingPayment)).toThrow(
        'Incoming amount asset code or asset scale does not match up received amount'
      )
    })

    test('throws if receiving and incoming asset codes are different', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'CAD',
          assetScale: 1,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 1,
          value: '5'
        }
      })

      expect(() => validateIncomingPayment(incomingPayment)).toThrow(
        'Incoming amount asset code or asset scale does not match up received amount'
      )
    })

    test('throws if receiving amount is larger than incoming amount', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '10'
        }
      })

      expect(() => validateIncomingPayment(incomingPayment)).toThrow(
        'Received amount is larger than incoming amount'
      )
    })

    test('throws if receiving amount is the same as incoming amount but payment status is incomplete', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '10'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '10'
        },
        completed: false
      })

      expect(() => validateIncomingPayment(incomingPayment)).toThrow(
        'Incoming amount matches received amount but payment is not completed'
      )
    })

    test('throws if receiving amount asset code is different that ilp connection asset code', async (): Promise<void> => {
      const ilpStreamConnection = mockILPStreamConnection({
        assetCode: 'CAD'
      })

      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '0'
        },
        ilpStreamConnection
      })

      expect(() => validateIncomingPayment(incomingPayment)).toThrow(
        'Stream connection asset information does not match incoming payment asset information'
      )
    })

    test('throws if receiving amount asset scale is different that ilp connection asset scale', async (): Promise<void> => {
      const ilpStreamConnection = mockILPStreamConnection({
        assetCode: 'USD',
        assetScale: 1
      })

      const incomingPayment = mockIncomingPayment({
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '5'
        },
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '0'
        },
        ilpStreamConnection
      })

      expect(() => validateIncomingPayment(incomingPayment)).toThrow(
        'Stream connection asset information does not match incoming payment asset information'
      )
    })
  })
})
