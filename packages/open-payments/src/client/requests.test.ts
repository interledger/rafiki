/* eslint-disable @typescript-eslint/no-empty-function */
import { createAxiosInstance, get, post } from './requests'
import nock from 'nock'
import { mockOpenApiResponseValidators, silentLogger } from '../test/helpers'

describe('requests', (): void => {
  const logger = silentLogger

  describe('createAxiosInstance', (): void => {
    test('sets timeout properly', async (): Promise<void> => {
      expect(
        createAxiosInstance({ requestTimeoutMs: 1000 }).defaults.timeout
      ).toBe(1000)
    })
    test('sets Content-Type header properly', async (): Promise<void> => {
      expect(
        createAxiosInstance({ requestTimeoutMs: 0 }).defaults.headers.common[
          'Content-Type'
        ]
      ).toBe('application/json')
    })
  })

  describe('get', (): void => {
    const axiosInstance = createAxiosInstance({ requestTimeoutMs: 0 })
    const baseUrl = 'http://localhost:1000'
    const responseValidators = mockOpenApiResponseValidators()

    beforeAll(() => {
      jest.spyOn(axiosInstance, 'get')
    })

    test('sets headers properly if accessToken provided', async (): Promise<void> => {
      nock(baseUrl).get('/incoming-payment').reply(200)

      await get(
        { axiosInstance, logger },
        {
          url: `${baseUrl}/incoming-payment`,
          accessToken: 'accessToken'
        },
        responseValidators.successfulValidator
      )

      expect(axiosInstance.get).toHaveBeenCalledWith(
        `${baseUrl}/incoming-payment`,
        {
          headers: {
            Authorization: 'GNAP accessToken',
            Signature: 'TODO',
            'Signature-Input': 'TODO'
          }
        }
      )
    })

    test('sets headers properly if accessToken is not provided', async (): Promise<void> => {
      nock(baseUrl).get('/incoming-payment').reply(200)

      await get(
        { axiosInstance, logger },
        {
          url: `${baseUrl}/incoming-payment`
        },
        responseValidators.successfulValidator
      )

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
    const axiosInstance = createAxiosInstance({ requestTimeoutMs: 0 })
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
