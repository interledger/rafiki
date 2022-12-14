import { createGrantRoutes } from './grant'
import { OpenAPI, HttpMethod, createOpenAPI } from 'openapi'
import config from '../config'
import {
  defaultAxiosInstance,
  mockGrantRequest,
  silentLogger
} from '../test/helpers'
import * as requestors from './requests'
import { v4 as uuid } from 'uuid'

jest.mock('./requests', () => ({
  ...jest.requireActual('./requests.ts'),
  deleteRequest: jest.fn(),
  post: jest.fn()
}))

describe('grant', (): void => {
  let openApi: OpenAPI

  beforeAll(async () => {
    openApi = await createOpenAPI(config.OPEN_PAYMENTS_AS_OPEN_API_URL)
  })

  const deps = {
    axiosInstance: defaultAxiosInstance,
    logger: silentLogger,
    client: 'https://example.com/.well-known/pay'
  }

  describe('createGrantRoutes', (): void => {
    test('creates response validator for grant requests', async (): Promise<void> => {
      jest.spyOn(openApi, 'createResponseValidator')

      createGrantRoutes({ openApi, ...deps })
      expect(openApi.createResponseValidator).toHaveBeenCalledTimes(3)
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/',
        method: HttpMethod.POST
      })
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/continue/{id}',
        method: HttpMethod.POST
      })
      expect(openApi.createResponseValidator).toHaveBeenCalledWith({
        path: '/continue/{id}',
        method: HttpMethod.DELETE
      })
    })
  })

  describe('routes', () => {
    const url = 'http://localhost:1000'
    const accessToken = 'someAccessToken'

    describe('request', () => {
      test('calls post method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/' && method === HttpMethod.POST

        jest
          .spyOn(openApi, 'createResponseValidator')
          .mockImplementation(mockResponseValidator as never)

        const postSpy = jest.spyOn(requestors, 'post').mockResolvedValueOnce({})
        const grantRequest = mockGrantRequest()

        await createGrantRoutes({ openApi, ...deps }).request(
          { url },
          grantRequest
        )

        expect(postSpy).toHaveBeenCalledWith(
          { openApi, ...deps },
          {
            url,
            body: {
              ...grantRequest,
              client: deps.client
            }
          },
          true
        )
      })
    })

    describe('cancel', () => {
      test('calls delete method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/continue/{id}' && method === HttpMethod.DELETE

        jest
          .spyOn(openApi, 'createResponseValidator')
          .mockImplementation(mockResponseValidator as never)

        const deleteSpy = jest
          .spyOn(requestors, 'deleteRequest')
          .mockResolvedValueOnce()

        await createGrantRoutes({ openApi, ...deps }).cancel({
          url,
          accessToken
        })

        expect(deleteSpy).toHaveBeenCalledWith(
          { openApi, ...deps },
          { url, accessToken },
          true
        )
      })
    })

    describe('continue', () => {
      test('continue calls post method with correct validator', async (): Promise<void> => {
        const mockResponseValidator = ({ path, method }) =>
          path === '/continue/{id}' && method === HttpMethod.POST

        jest
          .spyOn(openApi, 'createResponseValidator')
          .mockImplementation(mockResponseValidator as never)

        const postSpy = jest.spyOn(requestors, 'post').mockResolvedValueOnce({})
        const interact_ref = uuid()

        await createGrantRoutes({ openApi, ...deps }).continue(
          {
            url,
            accessToken
          },
          { interact_ref }
        )

        expect(postSpy).toHaveBeenCalledWith(
          { openApi, ...deps },
          { url, accessToken, body: { interact_ref } },
          true
        )
      })
    })
  })
})
