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
  const client = 'https://example.com/.well-known/pay'

  describe('createGrantRoutes', (): void => {
    test('creates response validator for grant requests', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createGrantRoutes({ axiosInstance, openApi, logger, client })
      expect(openApi.createResponseValidator).toHaveBeenCalledTimes(1)
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/',
        method: HttpMethod.POST
      })
    })
  })
})
