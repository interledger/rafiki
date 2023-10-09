import { convertRatesToIlpPrices } from '.'

describe('Rates', () => {
  describe('convertRatesToIlpPrices', () => {
    const exampleRate = {
      base: 'USD',
      rates: {
        EUR: 0.5,
        XRP: 2,
        ABC: 1.5
      }
    }

    it('properly converts rates to ilp', async () => {
      expect(convertRatesToIlpPrices(exampleRate)).toEqual({
        USD: 1,
        EUR: 1 / 0.5,
        XRP: 1 / 2,
        ABC: 1 / 1.5
      })
    })

    it('returns 0 for invalid rates', async () => {
      expect(
        convertRatesToIlpPrices({
          base: 'USD',
          rates: {
            EUR: 0,
            NEGATIVE: -1
          }
        })
      ).toEqual({
        USD: 1,
        EUR: 0,
        NEGATIVE: 0
      })
    })
  })
})
