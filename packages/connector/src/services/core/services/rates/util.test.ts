import { convert, Asset } from './util'

describe('Rates util', function () {
  describe('convert', function () {
    it('converts same scales', () => {
      // Rate > 1
      expect(
        convert({
          exchangeRate: 1.5,
          sourceAmount: 100n,
          sourceAsset: asset(9),
          destinationAsset: asset(9)
        })
      ).toBe(150n)
      // Rate < 1
      expect(
        convert({
          exchangeRate: 0.5,
          sourceAmount: 100n,
          sourceAsset: asset(9),
          destinationAsset: asset(9)
        })
      ).toBe(50n)
      // Round down
      expect(
        convert({
          exchangeRate: 0.5,
          sourceAmount: 101n,
          sourceAsset: asset(9),
          destinationAsset: asset(9)
        })
      ).toBe(50n)
    })

    it('converts different scales', () => {
      // Scale low → high
      expect(
        convert({
          exchangeRate: 1.5,
          sourceAmount: 100n,
          sourceAsset: asset(9),
          destinationAsset: asset(12)
        })
      ).toBe(150_000n)
      // Scale high → low
      expect(
        convert({
          exchangeRate: 1.5,
          sourceAmount: 100_000n,
          sourceAsset: asset(12),
          destinationAsset: asset(9)
        })
      ).toBe(150n)
    })
  })
})

function asset(scale: number): Asset {
  return { code: '[ignored]', scale }
}
