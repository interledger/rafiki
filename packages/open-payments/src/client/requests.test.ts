/* eslint-disable @typescript-eslint/no-empty-function */
import { createAxiosInstance, get } from './requests'
import nock from 'nock'
import { silentLogger } from '../test/helpers'

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

    const validators = {
      successfulValidator: (data: unknown): data is unknown => true,
      failedValidator: (data: unknown): data is unknown => {
        throw new Error('Failed to validate response')
      }
    }

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
        validators.successfulValidator
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
        validators.successfulValidator
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

      const validatorSpy = jest.spyOn(validators, 'successfulValidator')

      await get(
        { axiosInstance, logger },
        {
          url: `${baseUrl}/incoming-payment`
        },
        validators.successfulValidator
      )

      expect(validatorSpy).toHaveBeenCalledWith({
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
          validators.failedValidator
        )
      ).rejects.toThrow(/Failed to validate OpenApi response/)
    })
  })
})
