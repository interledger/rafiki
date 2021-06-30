import nock from 'nock'
import { createXRPService, CHARTS_API } from './service'

describe('XRP Service', function () {
  afterAll(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  describe('fetchPrice', function () {
    const service = createXRPService()

    it('fetches a price', async () => {
      const price = await service.fetchPrice()
      expect(typeof price).toBe('number')
      expect(price).toBeGreaterThan(0.0)
    })

    it('inverts the rate', async () => {
      const rate = 1.8630767
      nock(CHARTS_API)
        .get('')
        .reply(200, { result: 'success', rate: rate.toString() })
      const price = await service.fetchPrice()
      expect(price).toBe(1.0 / rate)
    })
  })
})
