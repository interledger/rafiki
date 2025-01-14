import { ensureTrailingSlash, isValidDateString } from './utils'

describe('utils', (): void => {
  describe('isValidDateString', () => {
    test.each([
      ['2024-12-05T15:10:09.545Z', true],
      ['2024-12-05', true],
      ['invalid-date', false], // Invalid date string
      ['2024-12-05T25:10:09.545Z', false], // Invalid date string (invalid hour)
      ['"2024-12-05T15:10:09.545Z"', false], // Improperly formatted string
      ['', false], // Empty string
      [null, false], // Null value
      [undefined, false] // Undefined value
    ])('should return %p for input %p', (input, expected) => {
      expect(isValidDateString(input!)).toBe(expected)
    })
  })

  describe('ensureTrailingSlash', (): void => {
    test('test ensuring trailing slash', async (): Promise<void> => {
      const path = '/utils'

      expect(ensureTrailingSlash(path)).toBe(`${path}/`)
      expect(ensureTrailingSlash(`${path}/`)).toBe(`${path}/`)
    })
  })

  describe('isValidDateString', () => {
    test.each([
      ['2024-12-05T15:10:09.545Z', true],
      ['2024-12-05', true],
      ['invalid-date', false], // Invalid date string
      ['2024-12-05T25:10:09.545Z', false], // Invalid date string (invalid hour)
      ['"2024-12-05T15:10:09.545Z"', false], // Improperly formatted string
      ['', false], // Empty string
      [null, false], // Null value
      [undefined, false] // Undefined value
    ])('should return %p for input %p', (input, expected) => {
      expect(isValidDateString(input!)).toBe(expected)
    })
  })
})
