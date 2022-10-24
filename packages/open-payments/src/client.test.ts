import { createAxiosInstance, get } from './client'
import nock from 'nock'

describe('open-payments', (): void => {
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

    beforeEach(() => {
      jest.spyOn(axiosInstance, 'get')
    })

    test('sets headers properly if accessToken provided', async (): Promise<void> => {
      nock(baseUrl)
        .get('/incoming-payment')
        .reply(200, () => ({
          validReceiver: 0
        }))

      await get(axiosInstance, {
        url: `${baseUrl}/incoming-payment`,
        accessToken: 'accessToken'
      })

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
      nock(baseUrl)
        .get('/incoming-payment')
        .reply(200, () => ({
          validReceiver: 0
        }))

      await get(axiosInstance, {
        url: `${baseUrl}/incoming-payment`
      })

      expect(axiosInstance.get).toHaveBeenCalledWith(
        `${baseUrl}/incoming-payment`,
        {
          headers: {}
        }
      )
    })
  })
})
