import { createQuoteRoutes } from './quote'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import config from '../config'
import { defaultAxiosInstance, silentLogger } from '../test/helpers'

describe('quote', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_RS_OPEN_API_URL)
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger

  describe('createQuoteRoutes', (): void => {
    test('creates getQuoteOpenApiValidator  properly', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createQuoteRoutes({ axiosInstance, openApi, logger })
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/quotes/{id}',
        method: HttpMethod.GET
      })
    })

    test('creates createQuoteOpenApiValidator properly', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createQuoteRoutes({ openApi, axiosInstance, logger })

      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/quotes',
        method: HttpMethod.POST
      })
    })
  })
})
