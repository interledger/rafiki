import { createILPStreamConnectionRoutes } from './ilp-stream-connection'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import path from 'path'
import { defaultAxiosInstance, silentLogger } from '../test/helpers'

describe('ilp-stream-connection', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(
      path.resolve(__dirname, '../openapi/resource-server.yaml')
    )
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger

  describe('createILPStreamConnectionRoutes', (): void => {
    test('calls createResponseValidator properly', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createILPStreamConnectionRoutes({ axiosInstance, openApi, logger })
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/connections/{id}',
        method: HttpMethod.GET
      })
    })
  })
})
