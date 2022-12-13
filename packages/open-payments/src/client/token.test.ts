import { createTokenRoutes } from './token'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import config from '../config'
import { defaultAxiosInstance, silentLogger } from '../test/helpers'

describe('token', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_AS_OPEN_API_URL)
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger
  const client = 'https://example.com/.well-known/pay'

  describe('createTokenRoutes', (): void => {
    test('creates response validator for token requests', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createTokenRoutes({ axiosInstance, openApi, logger, client })
      expect(openApi.createResponseValidator).toHaveBeenCalledTimes(1)
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/token/{id}',
        method: HttpMethod.POST
      })
    })
  })
})
