import { mockJwk, mockTokenInfo } from './test/helpers'
import {
  isActiveTokenInfo,
  isClientWalletAddress,
  isClientJwk
} from './types'

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

  describe('isClientWalletAddress', (): void => {
    test('returns true when client has walletAddress', (): void => {
      const tokenInfo = mockTokenInfo()
      if (!isActiveTokenInfo(tokenInfo)) throw new Error('expected active')
      expect(isClientWalletAddress(tokenInfo)).toBe(true)
    })
    test('returns false when client has jwk', (): void => {
      const tokenInfo = mockTokenInfo({ client: { jwk: mockJwk() } })
      if (!isActiveTokenInfo(tokenInfo)) throw new Error('expected active')
      expect(isClientWalletAddress(tokenInfo)).toBe(false)
    })
  })

  describe('isClientJwk', (): void => {
    test('returns true when client has jwk', (): void => {
      const tokenInfo = mockTokenInfo({ client: { jwk: mockJwk() } })
      if (!isActiveTokenInfo(tokenInfo)) throw new Error('expected active')
      expect(isClientJwk(tokenInfo)).toBe(true)
    })
    test('returns false when client has walletAddress', (): void => {
      const tokenInfo = mockTokenInfo()
      if (!isActiveTokenInfo(tokenInfo)) throw new Error('expected active')
      expect(isClientJwk(tokenInfo)).toBe(false)
    })
  })
})
