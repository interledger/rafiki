/* eslint-disable @typescript-eslint/no-empty-function */
import { createAxiosInstance, get, post } from './requests'
import { generateKeyPairSync } from 'crypto'
import nock from 'nock'
import { mockOpenApiResponseValidators, silentLogger } from '../test/helpers'

describe('requests', (): void => {
  const logger = silentLogger
  const privateKey = generateKeyPairSync('ed25519').privateKey
  const keyId = 'myId'

  describe('createAxiosInstance', (): void => {
    test('sets timeout properly', async (): Promise<void> => {
      expect(
        createAxiosInstance({ requestTimeoutMs: 1000, privateKey, keyId })
          .defaults.timeout
      ).toBe(1000)
    })
    test('sets Content-Type header properly', async (): Promise<void> => {
      expect(
        createAxiosInstance({ requestTimeoutMs: 0, privateKey, keyId }).defaults
          .headers.common['Content-Type']
      ).toBe('application/json')
    })
  })

  describe('get', (): void => {
    const axiosInstance = createAxiosInstance({
      requestTimeoutMs: 0,
      privateKey,
      keyId
    })
    const baseUrl = 'http://localhost:1000'
    const responseValidators = mockOpenApiResponseValidators()

    beforeAll(() => {
      jest.spyOn(axiosInstance, 'get')
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    test('sets headers properly if accessToken provided', async (): Promise<void> => {
      // https://github.com/nock/nock/issues/2200#issuecomment-1280957462
      jest
        .useFakeTimers({
          doNotFake: [
            'nextTick',
            'setImmediate',
            'clearImmediate',
            'setInterval',
            'clearInterval',
            'setTimeout',
            'clearTimeout'
          ]
        })
        .setSystemTime(new Date())

      const scope = nock(baseUrl)
        .matchHeader('Signature', /sig1=:([a-zA-Z0-9+/]){86}==:/)
        .matchHeader(
          'Signature-Input',
          `sig1=("@method" "@target-uri" "authorization");created=${Math.floor(
            Date.now() / 1000
          )};keyid="${keyId}"`
        )
        .get('/incoming-payment')
        // TODO: verify signature
        .reply(200)

      await get(
        { axiosInstance, logger },
        {
          url: `${baseUrl}/incoming-payment`,
          accessToken: 'accessToken'
        },
        responseValidators.successfulValidator
      )

      scope.done()

      expect(axiosInstance.get).toHaveBeenCalledWith(
        `${baseUrl}/incoming-payment`,
        {
          headers: {
            Authorization: 'GNAP accessToken'
          }
        }
      )
    })

    test('sets headers properly if accessToken is not provided', async (): Promise<void> => {
      const scope = nock(baseUrl)
        .matchHeader('Signature', (sig) => sig === undefined)
        .matchHeader('Signature-Input', (sigInput) => sigInput === undefined)
        .get('/incoming-payment')
        .reply(200)

      await get(
        { axiosInstance, logger },
        {
          url: `${baseUrl}/incoming-payment`
        },
        responseValidators.successfulValidator
      )
      scope.done()

      expect(axiosInstance.get).toHaveBeenCalledWith(
        `${baseUrl}/incoming-payment`,
        {
          headers: {}
        }
      )
    })

    test('calls validator function properly', async (): Promise<void> => {
      const status = 200
      const body = {
        id: 'id'
      }

      nock(baseUrl).get('/incoming-payment').reply(status, body)

      const responseValidatorSpy = jest.spyOn(
        responseValidators,
        'successfulValidator'
      )

      await get(
        { axiosInstance, logger },
        {
          url: `${baseUrl}/incoming-payment`
        },
        responseValidators.successfulValidator
      )

      expect(responseValidatorSpy).toHaveBeenCalledWith({
        body,
        status
      })
    })

    test('throws if response validator function fails', async (): Promise<void> => {
      nock(baseUrl).get('/incoming-payment').reply(200)

      await expect(
        get(
          { axiosInstance, logger },
          {
            url: `${baseUrl}/incoming-payment`
          },
          responseValidators.failedValidator
        )
      ).rejects.toThrow(/Failed to validate OpenApi response/)
    })
  })

  describe('post', (): void => {
    const axiosInstance = createAxiosInstance({
      requestTimeoutMs: 0,
      privateKey,
      keyId
    })
    const baseUrl = 'http://localhost:1000'
    const responseValidators = mockOpenApiResponseValidators()

    beforeAll(() => {
      jest.spyOn(axiosInstance, 'post')
    })

    test('properly POSTs request', async (): Promise<void> => {
      const status = 200
      const body = {
        id: 'id'
      }

      nock(baseUrl).post('/grant', body).reply(status, body)

      await post(
        { axiosInstance, logger },
        {
          url: `${baseUrl}/grant`,
          body
        },
        responseValidators.successfulValidator
      )

      expect(axiosInstance.post).toHaveBeenCalledWith(`${baseUrl}/grant`, body)
    })

    test('calls validator function properly', async (): Promise<void> => {
      const status = 200
      const body = {
        id: 'id'
      }

      nock(baseUrl).post('/grant', body).reply(status, body)

      const responseValidatorSpy = jest.spyOn(
        responseValidators,
        'successfulValidator'
      )

      await post(
        { axiosInstance, logger },
        {
          url: `${baseUrl}/grant`,
          body
        },
        responseValidators.successfulValidator
      )

      expect(responseValidatorSpy).toHaveBeenCalledWith({
        body,
        status
      })
    })

    test('throws if response validator function fails', async (): Promise<void> => {
      const status = 200
      const body = {
        id: 'id'
      }
      nock(baseUrl).post('/grant', body).reply(status, body)

      await expect(
        post(
          { axiosInstance, logger },
          {
            url: `${baseUrl}/grant`,
            body
          },
          responseValidators.failedValidator
        )
      ).rejects.toThrow(/Failed to validate OpenApi response/)
    })
  })
})
