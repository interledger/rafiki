import { createGrantRoutes } from './grant'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import path from 'path'
import { defaultAxiosInstance, silentLogger } from '../test/helpers'

describe('grant', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(
      path.resolve(__dirname, '../openapi/auth-server.yaml')
    )
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger
  const client = 'https://example.com/.well-known/pay'

  describe('createGrantRoutes', (): void => {
    test('creates response validator for grant requests', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createGrantRoutes({ axiosInstance, openApi, logger, client })
      expect(openApi.createResponseValidator).toHaveBeenCalledTimes(2)
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/',
        method: HttpMethod.POST
      })
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/continue/{id}',
        method: HttpMethod.POST
      })
    })
  })
})
