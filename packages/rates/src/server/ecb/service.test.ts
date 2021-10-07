import * as fs from 'fs'
import nock from 'nock'
import { createECBService, RATES_API } from './service'

const FIXTURE_XML = fs
  .readFileSync(`${__dirname}/test-eurofxref-daily.xml`)
  .toString()

describe('ECB Service', function () {
  beforeEach(() => {
    nock(RATES_API).get('').reply(200, FIXTURE_XML)
  })

  afterAll(() => {
    nock.cleanAll()
  })

  describe('fetchPrices', function () {
    const service = createECBService()

    it('loads prices', async () => {
      const prices = await service.fetchPrices()
      expect(prices.EUR).toBe(1.0) // base currency
      expect(typeof prices.USD).toBe('number')
    })

    it('requests prices', async () => {
      const prices = await service.fetchPrices()
      expect(prices).toEqual({
        EUR: 1.0,
        AUD: 1.0 / 1.5756,
        BGN: 1.0 / 1.9558,
        BRL: 1.0 / 5.9041,
        CAD: 1.0 / 1.4678,
        CHF: 1.0 / 1.0967,
        CNY: 1.0 / 7.7193,
        CZK: 1.0 / 25.423,
        DKK: 1.0 / 7.4362,
        GBP: 1.0 / 0.85883,
        HKD: 1.0 / 9.2675,
        HRK: 1.0 / 7.4993,
        HUF: 1.0 / 350.52,
        IDR: 1.0 / 17249.38,
        ILS: 1.0 / 3.8791,
        INR: 1.0 / 88.502,
        ISK: 1.0 / 146.2,
        JPY: 1.0 / 132.2,
        KRW: 1.0 / 1351.07,
        MXN: 1.0 / 23.9678,
        MYR: 1.0 / 4.9654,
        NOK: 1.0 / 10.174,
        NZD: 1.0 / 1.6903,
        PHP: 1.0 / 58.051,
        PLN: 1.0 / 4.5245,
        RON: 1.0 / 4.9245,
        RUB: 1.0 / 86.2638,
        SEK: 1.0 / 10.1133,
        SGD: 1.0 / 1.6039,
        THB: 1.0 / 38.016,
        TRY: 1.0 / 10.3802,
        USD: 1.0 / 1.1936,
        ZAR: 1.0 / 17.0028
      })
    })
  })
})
