import nock from 'nock'
import { Rates } from '../rates/service'

export function mockRatesApi(
  exchangeRatesUrl: string,
  getRates: (baseAssetCode: unknown) => Rates['rates']
) {
  return nock(exchangeRatesUrl)
    .get('/')
    .query(true)
    .reply(200, (url) => {
      const base = url.split('=')[1]
      const rates = getRates(base)

      return {
        base,
        rates
      }
    })
    .persist()
}
