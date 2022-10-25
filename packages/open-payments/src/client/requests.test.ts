/* eslint-disable @typescript-eslint/no-empty-function */
import { createAxiosInstance, get } from './requests'
import nock from 'nock'
import { silentLogger } from '../test/helpers'

describe('requests', (): void => {
  const logger = silentLogger

  describe('createAxiosInstance', (): void => {
    test('sets timeout properly', async (): Promise<void> => {
      expect(createAxiosInstance({ timeout: 1000 }).defaults.timeout).toBe(1000)
    })
    test('sets Content-Type header properly', async (): Promise<void> => {
      expect(
        createAxiosInstance().defaults.headers.common['Content-Type']
      ).toBe('application/json')
    })
  })

  describe('get', (): void => {
    const axiosInstance = createAxiosInstance()
    const baseUrl = 'http://localhost:1000'
    const successfulValidator = (data: unknown): data is unknown => true
    const failedValidator = (data: unknown): data is unknown => false

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
        successfulValidator
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
        successfulValidator
      )

      expect(axiosInstance.get).toHaveBeenCalledWith(
        `${baseUrl}/incoming-payment`,
        {
          headers: {}
        }
      )
    })

    test('throws if response validator function fails', async (): Promise<void> => {
      nock(baseUrl).get('/incoming-payment').reply(200)

      await expect(
        get(
          { axiosInstance, logger },
          {
            url: `${baseUrl}/incoming-payment`
          },
          failedValidator
        )
      ).rejects.toThrow('Failed to validate OpenApi response')
    })
  })
})
