import { mockTokenInfo } from './test/helpers'
import { isActiveTokenInfo } from './types'

describe('types', (): void => {
  describe('isActiveTokenInfo', (): void => {
    test('returns true if token info is active', async (): Promise<void> => {
      expect(isActiveTokenInfo(mockTokenInfo())).toBe(true)
    })
    test('returns false if token info is not active', async (): Promise<void> => {
      expect(
        isActiveTokenInfo({
          active: false
        })
      ).toBe(false)
    })
  })
})
