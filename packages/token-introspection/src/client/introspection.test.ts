import { createIntrospectionRoutes, introspectToken } from './introspection'
import {
  defaultAxiosInstance,
  mockTokenInfo,
  silentLogger
} from '../test/helpers'
import nock from 'nock'

describe('introspection', (): void => {
  const axiosInstance = defaultAxiosInstance
  const logger = silentLogger
  const baseUrl = 'http://localhost:1000'

  describe('createIntrospectionRoutes', (): void => {
    test('creates introspection client properly', async (): Promise<void> => {
      createIntrospectionRoutes({
        axiosInstance,
        logger
      })
    })
  })

  describe('introspectToken', (): void => {
    const body = {
      access_token: 'OS9M2PMHKUR64TB8N6BW7OZB8CDFONP219RP1LT0'
    }

    test('returns token info', async (): Promise<void> => {
      const tokenInfo = mockTokenInfo()
      const scope = nock(baseUrl).post('/', body).reply(200, tokenInfo)

      await expect(
        introspectToken(
          {
            axiosInstance,
            logger
          },
          body
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
          body
        )
      ).rejects.toThrowError()
      scope.done()
    })
  })
})
