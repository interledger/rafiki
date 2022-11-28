import { mockInteractiveGrant, mockNonInteractiveGrant } from './test/helpers'
import { isInteractiveGrant, isNonInteractiveGrant } from './types'

describe('types', (): void => {
  describe('isInteractiveGrant', (): void => {
    test('returns true if has interact property', async (): Promise<void> => {
      expect(isInteractiveGrant(mockInteractiveGrant())).toBe(true)
    })

    test('returns false if does not have interact property', async (): Promise<void> => {
      expect(
        isInteractiveGrant(
          mockInteractiveGrant({
            interact: undefined
          })
        )
      ).toBe(false)
    })
  })

  describe('isNonInteractiveGrant', (): void => {
    test('returns true if has access_token property', async (): Promise<void> => {
      expect(isNonInteractiveGrant(mockNonInteractiveGrant())).toBe(true)
    })

    test('returns false if does not have access_token property', async (): Promise<void> => {
      expect(
        isNonInteractiveGrant(
          mockNonInteractiveGrant({
            access_token: undefined
          })
        )
      ).toBe(false)
    })
  })
})
