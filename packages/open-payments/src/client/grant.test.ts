import { createGrantRoutes } from './grant'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import config from '../config'
import { defaultAxiosInstance, silentLogger } from '../test/helpers'

describe('grant', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_AS_OPEN_API_URL)
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger

  describe('createGrantRoutes', (): void => {
    test('creates response validators for grant requests', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createGrantRoutes({ axiosInstance, openApi, logger })
      expect(openApi.createResponseValidator).toHaveBeenNthCalledWith(1, {
        path: '/',
        method: HttpMethod.POST
      })
      expect(openApi.createResponseValidator).toHaveBeenNthCalledWith(2, {
        path: '/',
        method: HttpMethod.POST
      })
    })
  })
})
