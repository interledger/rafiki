import crypto from 'crypto'
import createLogger from 'pino'
import { createAxiosInstance } from '../client'
import { JWK, TokenInfo } from '../types'
import { ResponseValidator } from '@interledger/openapi'

export const silentLogger = createLogger({
  level: 'silent'
})

export const defaultAxiosInstance = createAxiosInstance({
  url: 'http://localhost:1000',
  requestTimeoutMs: 0
})

export const mockOpenApiResponseValidators = () => ({
  successfulValidator: ((data: unknown): data is unknown =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    true) as ResponseValidator<any>,
  failedValidator: ((data: unknown): data is unknown => {
    throw new Error('Failed to validate response')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as ResponseValidator<any>
})

export const mockTokenInfo = (overrides?: Partial<TokenInfo>): TokenInfo => ({
  active: true,
  grant: crypto.randomUUID(),
  client: { walletAddress: 'https://example.com/.well-known/pay' },
  access: [
    {
      type: 'incoming-payment',
      actions: ['read']
    }
  ],
  ...overrides
})

export const mockJwk = (): JWK => ({
  kid: crypto.randomUUID(),
  alg: 'EdDSA',
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'test-public-key-base64url'
})
