import { createTokenRoutes, rotateToken } from './token'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import config from '../config'
import {
  defaultAxiosInstance,
  mockAccessToken,
  mockOpenApiResponseValidators,
  silentLogger
} from '../test/helpers'
import nock from 'nock'

describe('token', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_AS_OPEN_API_URL)
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger
  const openApiValidators = mockOpenApiResponseValidators()

  describe('createTokenRoutes', (): void => {
    test('creates response validator for token requests', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')
      createTokenRoutes({ axiosInstance, openApi, logger })

      expect(openApi.createResponseValidator).toHaveBeenCalledTimes(1)
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/token/{id}',
        method: HttpMethod.POST
      })
    })
  })

  describe('rotateToken', (): void => {
    test('returns accessToken if passes validation', async (): Promise<void> => {
      const accessToken = mockAccessToken()

      const manageUrl = new URL(accessToken.access_token.manage)
      nock(manageUrl.origin).post(manageUrl.pathname).reply(200, accessToken)

      const result = await rotateToken(
        {
          axiosInstance,
          openApi,
          logger
        },
        {
          url: accessToken.access_token.manage
        },
        openApiValidators.successfulValidator
      )
      expect(result).toStrictEqual(accessToken)
    })

    test('throws if rotate token does not pass open api validation', async (): Promise<void> => {
      const accessToken = mockAccessToken()

      const manageUrl = new URL(accessToken.access_token.manage)
      nock(manageUrl.origin).post(manageUrl.pathname).reply(200, accessToken)

      await expect(() =>
        rotateToken(
          {
            axiosInstance,
            openApi,
            logger
          },
          {
            url: accessToken.access_token.manage
          },
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError()
    })
  })
})
