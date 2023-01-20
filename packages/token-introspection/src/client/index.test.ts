import { createAxiosInstance } from './'

describe('client', (): void => {
  const url = 'http://localhost:1000'

  describe('createAxiosInstance', (): void => {
    test('sets url properly', async (): Promise<void> => {
      expect(
        createAxiosInstance({
          url,
          requestTimeoutMs: 1000
        }).defaults.baseURL
      ).toBe(url)
    })
    test('sets method properly', async (): Promise<void> => {
      expect(
        createAxiosInstance({
          url,
          requestTimeoutMs: 1000
        }).defaults.method
      ).toBe('post')
    })
    test('sets timeout properly', async (): Promise<void> => {
      expect(
        createAxiosInstance({ url, requestTimeoutMs: 1000 }).defaults.timeout
      ).toBe(1000)
    })
  })
})
