/* eslint-disable @typescript-eslint/no-empty-function */
import { createILPStreamConnectionRoutes } from './ilp-stream-connection'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import { createAxiosInstance } from './requests'
import config from '../config'

describe('ilp-stream-connection', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_OPEN_API_URL)
  })

  const axiosInstance = createAxiosInstance()

  describe('createILPStreamConnectionRoutes', (): void => {
    test('calls createResponseValidator properly', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createILPStreamConnectionRoutes(axiosInstance, openApi)
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/connections/{id}',
        method: HttpMethod.GET
      })
    })
  })
})
