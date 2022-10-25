/* eslint-disable @typescript-eslint/no-empty-function */
import { createIncomingPaymentRoutes } from './incoming-payment'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import { createAxiosInstance } from './requests'
import config from '../config'

describe('incoming-payment', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_OPEN_API_URL)
  })

  const axiosInstance = createAxiosInstance()

  describe('createIncomingPaymentRoutes', (): void => {
    test('calls createResponseValidator properly', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createIncomingPaymentRoutes(axiosInstance, openApi)
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/incoming-payments/{id}',
        method: HttpMethod.GET
      })
    })
  })
})
