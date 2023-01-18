import {
  createIntrospectionRoutes,
  introspectToken,
  validateTokenInfo
} from './introspection'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import {
  defaultAxiosInstance,
  mockOpenApiResponseValidators,
  mockTokenInfo,
  silentLogger
} from '../test/helpers'
import nock from 'nock'
import path from 'path'

describe('introspection', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(
      path.resolve(__dirname, '../openapi/token-introspection.yaml')
    )
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

  describe('validateTokenInfo', (): void => {
    test('returns valid token info', async (): Promise<void> => {
      const tokenInfo = mockTokenInfo()
      expect(validateTokenInfo(tokenInfo)).toEqual(tokenInfo)
    })

    test.skip('throws if token info does not include specified access', async (): Promise<void> => {
      const tokenInfo = mockTokenInfo()
      expect(validateTokenInfo(tokenInfo)).toThrow(
        'Token info does not include specified access'
      )
    })
  })
})
