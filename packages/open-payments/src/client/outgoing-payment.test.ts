import {
  createOutgoingPayment,
  createOutgoingPaymentRoutes,
  getOutgoingPayment,
  validateOutgoingPayment
} from './outgoing-payment'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import {
  defaultAxiosInstance,
  mockOutgoingPayment,
  mockOpenApiResponseValidators,
  silentLogger
} from '../test/helpers'
import nock from 'nock'
import path from 'path'
import { v4 as uuid } from 'uuid'

describe('outgoing-payment', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(
      path.resolve(__dirname, '../openapi/resource-server.yaml')
    )
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

    test('creates createOutgoingPaymentOpenApiValidator properly', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createOutgoingPaymentRoutes({
        axiosInstance,
        openApi,
        logger
      })
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/outgoing-payments',
        method: HttpMethod.POST
      })
    })
  })

  describe('getOutgoingPayment', (): void => {
    test('returns outgoing payment if passes validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment()

      nock(baseUrl).get('/outgoing-payments').reply(200, outgoingPayment)

      const result = await getOutgoingPayment(
        {
          axiosInstance,
          logger
        },
        {
          url: `${baseUrl}/outgoing-payments`,
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
            url: `${baseUrl}/outgoing-payments`,
            accessToken: 'accessToken'
          },
          openApiValidators.successfulValidator
        )
      ).rejects.toThrowError()
    })

    test('throws if outgoing payment does not pass open api validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment()

      nock(baseUrl).get('/outgoing-payment').reply(200, outgoingPayment)

      await expect(() =>
        getOutgoingPayment(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/outgoing-payments`,
            accessToken: 'accessToken'
          },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError()
    })
  })

  describe('createOutgoingPayment', (): void => {
    const quoteId = `${baseUrl}/quotes/${uuid()}`

    test.each`
      description           | externalRef
      ${'Some description'} | ${'#INV-1'}
      ${undefined}          | ${undefined}
    `(
      'creates outgoing payment',
      async ({ description, externalRef }): Promise<void> => {
        const outgoingPayment = mockOutgoingPayment({
          quoteId,
          description,
          externalRef
        })

        const scope = nock(baseUrl)
          .post('/outgoing-payments')
          .reply(200, outgoingPayment)

        const result = await createOutgoingPayment(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/outgoing-payments`,
            accessToken: 'accessToken',
            body: {
              quoteId,
              description,
              externalRef
            }
          },
          openApiValidators.successfulValidator
        )
        expect(result).toEqual(outgoingPayment)
        scope.done()
      }
    )

    test('throws if outgoing payment does not pass validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment({
        sendAmount: {
          assetCode: 'USD',
          assetScale: 3,
          value: '5'
        },
        sentAmount: {
          assetCode: 'CAD',
          assetScale: 3,
          value: '0'
        }
      })

      const scope = nock(baseUrl)
        .post('/outgoing-payments')
        .reply(200, outgoingPayment)

      await expect(() =>
        createOutgoingPayment(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/outgoing-payments`,
            accessToken: 'accessToken',
            body: {
              quoteId: uuid()
            }
          },
          openApiValidators.successfulValidator
        )
      ).rejects.toThrowError()
      scope.done()
    })

    test('throws if outgoing payment does not pass open api validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment()

      const scope = nock(baseUrl)
        .post('/outgoing-payments')
        .reply(200, outgoingPayment)

      await expect(() =>
        createOutgoingPayment(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/outgoing-payments`,
            accessToken: 'accessToken',
            body: {
              quoteId: uuid()
            }
          },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError()
      scope.done()
    })
  })

  describe('validateOutgoingPayment', (): void => {
    test('returns outgoing payment if passes validation', async (): Promise<void> => {
      const outgoingPayment = mockOutgoingPayment()

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
        'Asset code or asset scale of sending amount does not match sent amount'
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
        'Asset code or asset scale of sending amount does not match sent amount'
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
