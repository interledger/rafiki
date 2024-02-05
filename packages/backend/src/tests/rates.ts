import { Rates } from '../rates/service'

const nock = (global as unknown as { nock: typeof import('nock') }).nock

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
