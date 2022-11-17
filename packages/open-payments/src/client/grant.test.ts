import {
  createGrantRoutes,
  isInteractiveGrant,
  isNonInteractiveGrant
} from './grant'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import config from '../config'
import {
  defaultAxiosInstance,
  mockInteractiveGrant,
  mockNonInteractiveGrant,
  silentLogger
} from '../test/helpers'

describe('grant', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_AS_OPEN_API_URL)
  })

  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger

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

  describe('isInteractiveGrant', (): void => {
    test('returns true if has interact property', async (): Promise<void> => {
      expect(isInteractiveGrant(mockInteractiveGrant())).toBe(true)
    })

    test('returns false if does not have interact property', async (): Promise<void> => {
      expect(
        isInteractiveGrant(
          mockInteractiveGrant({
            interact: undefined
          })
        )
      ).toBe(false)
    })
  })

  describe('isNonInteractiveGrant', (): void => {
    test('returns true if has access_token property', async (): Promise<void> => {
      expect(isNonInteractiveGrant(mockNonInteractiveGrant())).toBe(true)
    })

    test('returns false if does not have access_token property', async (): Promise<void> => {
      expect(
        isNonInteractiveGrant(
          mockNonInteractiveGrant({
            access_token: undefined
          })
        )
      ).toBe(false)
    })
  })
})
