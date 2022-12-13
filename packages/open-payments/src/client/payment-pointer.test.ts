import { createPaymentPointerRoutes } from './payment-pointer'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import path from 'path'
import { defaultAxiosInstance, silentLogger } from '../test/helpers'

describe('payment-pointer', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(
      path.resolve(__dirname, '../openapi/resource-server.yaml')
    )
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger

  describe('createPaymentPointerRoutes', (): void => {
    test('calls createResponseValidator properly', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createPaymentPointerRoutes({
        axiosInstance,
        openApi,
        logger
      })
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/',
        method: HttpMethod.GET
      })
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/jwks.json',
        method: HttpMethod.GET
      })
    })
  })
})
