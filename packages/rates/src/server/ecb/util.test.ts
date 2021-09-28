import * as fs from 'fs'
import { parseResponse, ratesToPrices } from './util'

const FIXTURE_XML = fs
  .readFileSync(`${__dirname}/test-eurofxref-daily.xml`)
  .toString()
const FIXTURE = JSON.parse(
  fs.readFileSync(`${__dirname}/test-eurofxref-daily.json`).toString()
)

describe('Util', function () {
  describe('parseResponse', function () {
    it('parses the fixture', async () => {
      await expect(parseResponse(FIXTURE_XML)).resolves.toEqual(FIXTURE)
    })
  })

  describe('ratesToPrices', function () {
    it('converts rates to prices', () => {
      expect(
        ratesToPrices({
          base: 'EUR',
          rates: {
            AUD: 1.5756,
            BGN: 1.9558,
            BRL: 5.9041,
            CAD: 1.4678,
            CHF: 1.0967
          }
        })
      ).toEqual({
        AUD: 1.0 / 1.5756,
        BGN: 1.0 / 1.9558,
        BRL: 1.0 / 5.9041,
        CAD: 1.0 / 1.4678,
        CHF: 1.0 / 1.0967,
        EUR: 1.0
      })
    })
  })
})
