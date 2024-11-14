import { convert, Asset, convertReverse } from './util'

describe('Rates util', () => {
  describe('convert', () => {
    describe('convert same scales', () => {
      test.each`
        exchangeRate | sourceAmount | assetScale | expectedResult                                    | description
        ${1.5}       | ${100n}      | ${9}       | ${{ amount: 150n, scaledExchangeRate: 1.5 }}      | ${'exchange rate above 1'}
        ${1.1602}    | ${12345n}    | ${2}       | ${{ amount: 14323n, scaledExchangeRate: 1.1602 }} | ${'exchange rate above 1 with rounding up'}
        ${1.1602}    | ${10001n}    | ${2}       | ${{ amount: 11603n, scaledExchangeRate: 1.1602 }} | ${'exchange rate above 1 with rounding down'}
        ${0.5}       | ${100n}      | ${9}       | ${{ amount: 50n, scaledExchangeRate: 0.5 }}       | ${'exchange rate below 1'}
        ${0.5}       | ${101n}      | ${9}       | ${{ amount: 51n, scaledExchangeRate: 0.5 }}       | ${'exchange rate below 1 with rounding up'}
        ${0.8611}    | ${1000n}     | ${2}       | ${{ amount: 861n, scaledExchangeRate: 0.8611 }}   | ${'exchange rate below 1 with rounding down'}
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
          ).toEqual(expectedResult)
        }
      )
    })

    describe('convert different scales', () => {
      test.each`
        exchangeRate | sourceAmount | sourceAssetScale | destinationAssetScale | expectedResult                                    | description
        ${1.5}       | ${100n}      | ${9}             | ${12}                 | ${{ amount: 150_000n, scaledExchangeRate: 1500 }} | ${'convert scale from low to high'}
        ${1.5}       | ${100_000n}  | ${12}            | ${9}                  | ${{ amount: 150n, scaledExchangeRate: 0.0015 }}   | ${'convert scale from high to low'}
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
          ).toEqual(expectedResult)
        }
      )
    })
  })
  describe('convert reverse', () => {
    describe('convert same scales', () => {
      test.each`
        exchangeRate | sourceAmount | assetScale | expectedResult                                    | description
        ${2.0}       | ${100n}      | ${9}       | ${{ amount: 50n, scaledExchangeRate: 2.0 }}       | ${'exchange rate above 1'}
        ${1.1602}    | ${12345n}    | ${2}       | ${{ amount: 10641n, scaledExchangeRate: 1.1602 }} | ${'exchange rate above 1 with rounding up'}
        ${0.5}       | ${100n}      | ${9}       | ${{ amount: 200n, scaledExchangeRate: 0.5 }}      | ${'exchange rate below 1'}
        ${0.8611}    | ${1000n}     | ${2}       | ${{ amount: 1162n, scaledExchangeRate: 0.8611 }}  | ${'exchange rate below 1 with rounding up'}
      `(
        '$description',
        async ({
          exchangeRate,
          sourceAmount,
          assetScale,
          expectedResult
        }): Promise<void> => {
          expect(
            convertReverse({
              exchangeRate,
              sourceAmount,
              sourceAsset: createAsset(assetScale),
              destinationAsset: createAsset(assetScale)
            })
          ).toEqual(expectedResult)
        }
      )
    })

    describe('convert different scales', () => {
      test.each`
        exchangeRate | sourceAmount | sourceAssetScale | destinationAssetScale | expectedResult                                    | description
        ${2.0}       | ${100n}      | ${9}             | ${12}                 | ${{ amount: 50_000n, scaledExchangeRate: 0.002 }} | ${'convert scale from low to high'}
        ${2.0}       | ${100_000n}  | ${12}            | ${9}                  | ${{ amount: 50n, scaledExchangeRate: 2000 }}      | ${'convert scale from high to low'}
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
            convertReverse({
              exchangeRate,
              sourceAmount,
              sourceAsset: createAsset(sourceAssetScale),
              destinationAsset: createAsset(destinationAssetScale)
            })
          ).toEqual(expectedResult)
        }
      )
    })
  })
})

function createAsset(scale: number): Asset {
  return { code: 'XYZ', scale }
}
