import { convert, Asset, convertRatesToIlpPrices } from './util'

describe('Rates util', () => {
  describe('convert', () => {
    describe('convert same scales', () => {
      test.each`
        exchangeRate | sourceAmount | assetScale | expectedResult | description
        ${1.5}       | ${100n}      | ${9}       | ${150n}        | ${'exchange rate above 1'}
        ${1.1602}    | ${12345n}    | ${2}       | ${14323n}      | ${'exchange rate above 1 with rounding up'}
        ${1.1602}    | ${10001n}    | ${2}       | ${11603n}      | ${'exchange rate above 1 with rounding down'}
        ${0.5}       | ${100n}      | ${9}       | ${50n}         | ${'exchange rate below 1'}
        ${0.5}       | ${101n}      | ${9}       | ${51n}         | ${'exchange rate below 1 with rounding up'}
        ${0.8611}    | ${1000n}     | ${2}       | ${861n}        | ${'exchange rate below 1 with rounding down'}
      `(
        '$description',
        async ({
          exchangeRate,
          sourceAmount,
          assetScale,
          expectedResult
        }): Promise<void> => {
          expect(
            convert({
              exchangeRate,
              sourceAmount,
              sourceAsset: createAsset(assetScale),
              destinationAsset: createAsset(assetScale)
            })
          ).toBe(expectedResult)
        }
      )
    })

    describe('convert different scales', () => {
      test.each`
        exchangeRate | sourceAmount | sourceAssetScale | destinationAssetScale | expectedResult | description
        ${1.5}       | ${100n}      | ${9}             | ${12}                 | ${150_000n}    | ${'convert scale from low to high'}
        ${1.5}       | ${100_000n}  | ${12}            | ${9}                  | ${150n}        | ${'convert scale from high to low'}
      `(
        '$description',
        async ({
          exchangeRate,
          sourceAmount,
          sourceAssetScale,
          destinationAssetScale,
          expectedResult
        }): Promise<void> => {
          expect(
            convert({
              exchangeRate,
              sourceAmount,
              sourceAsset: createAsset(sourceAssetScale),
              destinationAsset: createAsset(destinationAssetScale)
            })
          ).toBe(expectedResult)
        }
      )
    })
  })

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

function createAsset(scale: number): Asset {
  return { code: 'XYZ', scale }
}
