import { createIntrospectionRoutes, introspectToken } from './introspection'
import { OpenAPI, HttpMethod } from '@interledger/openapi'
import {
  defaultAxiosInstance,
  mockOpenApiResponseValidators,
  mockTokenInfo,
  silentLogger
} from '../test/helpers'
import nock from 'nock'
import { getTokenIntrospectionOpenAPI } from '../openapi'

describe('introspection', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await getTokenIntrospectionOpenAPI()
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger
  const baseUrl = 'http://localhost:1000'
  const openApiValidators = mockOpenApiResponseValidators()

  describe('createIntrospectionRoutes', (): void => {
    test('creates introspectOpenApiValidator properly', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createIntrospectionRoutes({
        axiosInstance,
        openApi,
        logger
      })
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/',
        method: HttpMethod.POST
      })
    })
  })

  describe('introspectToken', (): void => {
    const body = {
      access_token: 'OS9M2PMHKUR64TB8N6BW7OZB8CDFONP219RP1LT0'
    }

    test('returns token info if passes validation', async (): Promise<void> => {
      const tokenInfo = mockTokenInfo()
      const scope = nock(baseUrl).post('/', body).reply(200, tokenInfo)

      await expect(
        introspectToken(
          {
            axiosInstance,
            logger
          },
          body,
          openApiValidators.successfulValidator
        )
      ).resolves.toStrictEqual(tokenInfo)
      scope.done()
    })

    test.skip('throws if token info does not pass validation', async (): Promise<void> => {
      const tokenInfo = mockTokenInfo()

      const scope = nock(baseUrl).post('/', body).reply(200, tokenInfo)

      await expect(
        introspectToken(
          {
            axiosInstance,
            logger
          },
          body,
          openApiValidators.successfulValidator
        )
      ).rejects.toThrowError()
      scope.done()
    })

    test('throws if token info does not pass open api validation', async (): Promise<void> => {
      const scope = nock(baseUrl).post('/', body).reply(200, mockTokenInfo())

      await expect(() =>
        introspectToken(
          {
            axiosInstance,
            logger
          },
          body,
          openApiValidators.failedValidator
        )
      ).rejects.toThrowError()
      scope.done()
    })
  })
})
