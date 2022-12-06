import {
  createIncomingPayment,
  createIncomingPaymentRoutes,
  getIncomingPayment,
  validateCreatedIncomingPayment,
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
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_RS_OPEN_API_URL)
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

    test('creates createIncomingPaymentOpenApiValidator properly', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createIncomingPaymentRoutes({
        axiosInstance,
        openApi,
        logger
      })

      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/incoming-payments',
        method: HttpMethod.POST
      })
    })
  })

  describe('getIncomingPayment', (): void => {
    test('returns incoming payment if passes validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment()

      nock(baseUrl).get('/incoming-payments').reply(200, incomingPayment)

      const result = await getIncomingPayment(
        {
          axiosInstance,
          logger
        },
        {
          url: `${baseUrl}/incoming-payments`,
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

      nock(baseUrl).get('/incoming-payments').reply(200, incomingPayment)

      await expect(() =>
        getIncomingPayment(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/incoming-payments`,
            accessToken: 'accessToken'
          },
          openApiValidators.successfulValidator
        )
      ).rejects.toThrowError()
    })

    test('throws if incoming payment does not pass open api validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment()

      nock(baseUrl).get('/incoming-payments').reply(200, incomingPayment)

      await expect(() =>
        getIncomingPayment(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/incoming-payments`,
            accessToken: 'accessToken'
          },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError()
    })
  })

  describe('createIncomingPayment', (): void => {
    test.each`
      incomingAmount                                      | expiresAt                                      | description  | externalRef
      ${undefined}                                        | ${undefined}                                   | ${undefined} | ${undefined}
      ${{ assetCode: 'USD', assetScale: 2, value: '10' }} | ${new Date(Date.now() + 60_000).toISOString()} | ${'Invoice'} | ${'#INV-1'}
    `(
      'returns the incoming payment on success',
      async ({
        incomingAmount,
        expiresAt,
        description,
        externalRef
      }): Promise<void> => {
        const incomingPayment = mockIncomingPayment({
          incomingAmount,
          expiresAt,
          description,
          externalRef
        })

        const scope = nock(baseUrl)
          .post('/incoming-payments')
          .reply(200, incomingPayment)

        const result = await createIncomingPayment(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/incoming-payments`,
            body: {
              incomingAmount,
              expiresAt,
              description,
              externalRef
            },
            accessToken: 'accessToken'
          },
          openApiValidators.successfulValidator
        )

        scope.done()
        expect(result).toEqual(incomingPayment)
      }
    )

    test('throws if the created incoming payment does not pass validation', async (): Promise<void> => {
      const amount = {
        assetCode: 'USD',
        assetScale: 2,
        value: '10'
      }

      const incomingPayment = mockIncomingPayment({
        incomingAmount: amount,
        receivedAmount: amount,
        completed: false
      })

      const scope = nock(baseUrl)
        .post('/incoming-payments')
        .reply(200, incomingPayment)

      await expect(() =>
        createIncomingPayment(
          { axiosInstance, logger },
          {
            url: `${baseUrl}/incoming-payments`,
            body: {},
            accessToken: 'accessToken'
          },
          openApiValidators.successfulValidator
        )
      ).rejects.toThrowError()
      scope.done()
    })

    test('throws if the created incoming payment does not pass open api validation', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment()

      const scope = nock(baseUrl)
        .post('/incoming-payments')
        .reply(200, incomingPayment)

      await expect(() =>
        createIncomingPayment(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/incoming-payments`,
            body: {},
            accessToken: 'accessToken'
          },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError()
      scope.done()
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

  describe('validateCreatedIncomingPayment', (): void => {
    test('returns the created incoming payment if it passes validation', async (): Promise<void> => {
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
        }
      })

      expect(validateCreatedIncomingPayment(incomingPayment)).toStrictEqual(
        incomingPayment
      )
    })

    test('throws if received amount is a non-zero value for a newly created incoming payment', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        receivedAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: '1'
        }
      })

      expect(() => validateCreatedIncomingPayment(incomingPayment)).toThrow(
        'Received amount is a non-zero value.'
      )
    })

    test('throws if the created incoming payment is completed', async (): Promise<void> => {
      const incomingPayment = mockIncomingPayment({
        completed: true
      })

      expect(() => validateCreatedIncomingPayment(incomingPayment)).toThrow(
        'Can not create a completed incoming payment.'
      )
    })
  })
})
