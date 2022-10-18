/* eslint-disable @typescript-eslint/no-empty-function */
import { getIncomingPayment } from './incoming-payment'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import { createAxiosInstance } from './requests'
import config from '../config'

jest.mock('./requests', () => ({
  ...jest.requireActual('./requests'),
  get: jest.fn()
}))

describe('incoming-payment', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_OPEN_API_URL)
  })

  const axiosInstance = createAxiosInstance()

  describe('getIncomingPayment', (): void => {
    test('calls createResponseValidator properly', async (): Promise<void> => {
      const createResponseValidatorSpy = jest.spyOn(
        openApi,
        'createResponseValidator'
      )

      await getIncomingPayment(axiosInstance, openApi, {
        url: 'http://localhost:1000/incoming-payment'
      })
      expect(createResponseValidatorSpy).toHaveBeenCalledWith({
        path: '/incoming-payments/{id}',
        method: HttpMethod.GET
      })
    })
  })
})
