import { convertSource, Asset, convertDestination } from './util'

describe('Rates util', () => {
  describe('convertSource', () => {
    describe('convertSource same scales', () => {
      test.each`
        exchangeRate  | sourceAmount | assetScale | expectedResult                                    | description
        ${1.5}        | ${100n}      | ${9}       | ${{ amount: 150n, scaledExchangeRate: 1.5 }}      | ${'exchange rate above 1'}
        ${1.1602}     | ${12345n}    | ${2}       | ${{ amount: 14322n, scaledExchangeRate: 1.1602 }} | ${'exchange rate above 1'}
        ${1.1602}     | ${10001n}    | ${2}       | ${{ amount: 11603n, scaledExchangeRate: 1.1602 }} | ${'exchange rate above 1'}
        ${0.5}        | ${100n}      | ${9}       | ${{ amount: 50n, scaledExchangeRate: 0.5 }}       | ${'exchange rate below 1'}
        ${0.5}        | ${101n}      | ${9}       | ${{ amount: 50n, scaledExchangeRate: 0.5 }}       | ${'exchange rate below 1'}
        ${0.8611}     | ${1000n}     | ${2}       | ${{ amount: 861n, scaledExchangeRate: 0.8611 }}   | ${'exchange rate below 1'}
        ${0.05263158} | ${19n}       | ${2}       | ${{ amount: 1n, scaledExchangeRate: 0.05263158 }} | ${'1:19 exchange rate. exactly 1 unit'}
        ${0.05263158} | ${37n}       | ${2}       | ${{ amount: 1n, scaledExchangeRate: 0.05263158 }} | ${'1:19 exchange rate. more than 1 unit'}
        ${0.05263158} | ${38n}       | ${2}       | ${{ amount: 2n, scaledExchangeRate: 0.05263158 }} | ${'1:19 exchange rate. 2 units'}
        ${0.05263158} | ${56n}       | ${2}       | ${{ amount: 2n, scaledExchangeRate: 0.05263158 }} | ${'1:19 exchange rate. more than 2 units'}
      `(
        '$description',
        async ({
          exchangeRate,
          sourceAmount,
          assetScale,
          expectedResult
        }): Promise<void> => {
          expect(
            convertSource({
              exchangeRate,
              sourceAmount,
              sourceAsset: createAsset(assetScale),
              destinationAsset: createAsset(assetScale)
            })
          ).toEqual(expectedResult)
        }
      )
    })

    describe('convertSource different scales', () => {
      test.each`
        exchangeRate | sourceAmount    | sourceAssetScale | destinationAssetScale | expectedResult                                    | description
        ${1.5}       | ${100n}         | ${9}             | ${12}                 | ${{ amount: 150_000n, scaledExchangeRate: 1500 }} | ${'convert scale from low to high'}
        ${1.5}       | ${100_000n}     | ${12}            | ${9}                  | ${{ amount: 150n, scaledExchangeRate: 0.0015 }}   | ${'convert scale from high to low'}
        ${1}         | ${100_000_000n} | ${9}             | ${2}                  | ${{ amount: 10n, scaledExchangeRate: 0.0000001 }} | ${'exchange rate of 1 with different scale'}
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
            convertSource({
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
  describe('convertDestination', () => {
    describe('convert same scales', () => {
      test.each`
        exchangeRate | destinationAmount | assetScale | expectedResult                                    | description
        ${2.0}       | ${100n}           | ${9}       | ${{ amount: 50n, scaledExchangeRate: 2.0 }}       | ${'exchange rate above 1'}
        ${1.1602}    | ${12345n}         | ${2}       | ${{ amount: 10641n, scaledExchangeRate: 1.1602 }} | ${'exchange rate above 1 with rounding up'}
        ${0.5}       | ${100n}           | ${9}       | ${{ amount: 200n, scaledExchangeRate: 0.5 }}      | ${'exchange rate below 1'}
        ${0.8611}    | ${1000n}          | ${2}       | ${{ amount: 1162n, scaledExchangeRate: 0.8611 }}  | ${'exchange rate below 1 with rounding up'}
      `(
        '$description',
        async ({
          exchangeRate,
          destinationAmount,
          assetScale,
          expectedResult
        }): Promise<void> => {
          expect(
            convertDestination({
              exchangeRate,
              destinationAmount,
              sourceAsset: createAsset(assetScale),
              destinationAsset: createAsset(assetScale)
            })
          ).toEqual(expectedResult)
        }
      )
    })

    describe('convert different scales', () => {
      test.each`
        exchangeRate | destinationAmount | sourceAssetScale | destinationAssetScale | expectedResult                                    | description
        ${2.0}       | ${100n}           | ${12}            | ${9}                  | ${{ amount: 50_000n, scaledExchangeRate: 0.002 }} | ${'convert scale from low to high'}
        ${2.0}       | ${100_000n}       | ${9}             | ${12}                 | ${{ amount: 50n, scaledExchangeRate: 2000 }}      | ${'convert scale from high to low'}
        ${1}         | ${100_000_000n}   | ${2}             | ${9}                  | ${{ amount: 10n, scaledExchangeRate: 10000000 }}  | ${'convert scale from high to low (same asset)'}
      `(
        '$description',
        async ({
          exchangeRate,
          destinationAmount,
          sourceAssetScale,
          destinationAssetScale,
          expectedResult
        }): Promise<void> => {
          expect(
            convertDestination({
              exchangeRate,
              destinationAmount,
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
