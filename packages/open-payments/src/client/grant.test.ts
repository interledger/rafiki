import nock from 'nock'
import {
  createGrantRoutes,
  isInteractiveGrant,
  isNonInteractiveGrant,
  requestInteractiveGrant,
  requestNonInteractiveGrant
} from './grant'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import config from '../config'
import {
  defaultAxiosInstance,
  mockInteractiveGrant,
  mockInteractiveGrantRequest,
  mockNonInteractiveGrant,
  mockNonInteractiveGrantRequest,
  mockOpenApiResponseValidators,
  silentLogger
} from '../test/helpers'

describe('grant', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_AS_OPEN_API_URL)
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger
  const baseUrl = 'http://localhost:1000'
  const openApiValidators = mockOpenApiResponseValidators()

  describe('createGrantRoutes', (): void => {
    test('creates response validator for grant requests', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createGrantRoutes({ axiosInstance, openApi, logger })
      expect(openApi.createResponseValidator).toHaveBeenCalledTimes(1)
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/',
        method: HttpMethod.POST
      })
    })
  })

  describe('requestInteractiveGrant', (): void => {
    test('returns interactive grant if passes validation', async (): Promise<void> => {
      const interactiveGrant = mockInteractiveGrant()

      nock(baseUrl).post('/').reply(200, interactiveGrant)

      const result = await requestInteractiveGrant(
        {
          axiosInstance,
          logger
        },
        {
          url: `${baseUrl}/`,
          request: mockInteractiveGrantRequest()
        },
        openApiValidators.successfulValidator
      )
      expect(result).toStrictEqual(interactiveGrant)
    })

    test('throws if interactive grant does not pass validation', async (): Promise<void> => {
      const incorrectInteractiveGrant = mockInteractiveGrant({
        interact: undefined
      })

      nock(baseUrl).post('/').reply(200, incorrectInteractiveGrant)

      expect(
        requestInteractiveGrant(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/`,
            request: mockInteractiveGrantRequest()
          },
          openApiValidators.successfulValidator
        )
      ).rejects.toThrow('Could not validate interactive grant')
    })
  })

  describe('requestNonInteractiveGrant', (): void => {
    test('returns non-interactive grant if passes validation', async (): Promise<void> => {
      const nonInteractiveGrant = mockNonInteractiveGrant()

      nock(baseUrl).post('/').reply(200, nonInteractiveGrant)

      const result = await requestNonInteractiveGrant(
        {
          axiosInstance,
          logger
        },
        {
          url: `${baseUrl}/`,
          request: mockNonInteractiveGrantRequest()
        },
        openApiValidators.successfulValidator
      )
      expect(result).toStrictEqual(nonInteractiveGrant)
    })

    test('throws if non-interactive grant does not pass validation', async (): Promise<void> => {
      const incorrectNonInteractiveGrant = mockNonInteractiveGrant({
        access_token: undefined
      })

      nock(baseUrl).post('/').reply(200, incorrectNonInteractiveGrant)

      expect(
        requestNonInteractiveGrant(
          {
            axiosInstance,
            logger
          },
          {
            url: `${baseUrl}/`,
            request: mockNonInteractiveGrantRequest()
          },
          openApiValidators.successfulValidator
        )
      ).rejects.toThrow('Could not validate non-interactive grant')
    })
  })

  describe('isInteractiveGrant', (): void => {
    test('returns true if has interact property', async (): Promise<void> => {
      expect(isInteractiveGrant(mockInteractiveGrant())).toBe(true)
    })

    test('returns false if has access_token property', async (): Promise<void> => {
      const grant = mockInteractiveGrant()

      grant['access_token'] = { value: 'token' }

      expect(isInteractiveGrant(grant)).toBe(false)
    })
  })

  describe('isNonInteractiveGrant', (): void => {
    test('returns true if has access_token property', async (): Promise<void> => {
      expect(isNonInteractiveGrant(mockNonInteractiveGrant())).toBe(true)
    })

    test('returns false if has interact property', async (): Promise<void> => {
      const grant = mockNonInteractiveGrant()

      grant['interact'] = { redirect: 'http://example.com/redirect' }

      expect(isNonInteractiveGrant(grant)).toBe(false)
    })
  })
})
