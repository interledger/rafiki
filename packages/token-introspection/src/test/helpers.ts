import createLogger from 'pino'
import { createAxiosInstance } from '../client'
import { TokenInfo } from '../types'

export const silentLogger = createLogger({
  level: 'silent'
})

export const defaultAxiosInstance = createAxiosInstance({
  url: 'http://localhost:1000',
  requestTimeoutMs: 0
})

export const mockTokenInfo = (overrides?: Partial<TokenInfo>): TokenInfo => ({
  active: true,
  access: [
    {
      type: 'incoming-payment',
      actions: ['read']
    }
  ],
  ...overrides
})
