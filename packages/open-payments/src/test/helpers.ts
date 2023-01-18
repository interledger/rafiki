import { generateKeyPairSync } from 'crypto'
import createLogger from 'pino'
import { createAxiosInstance } from '../client/requests'
import {
  ILPStreamConnection,
  IncomingPayment,
  InteractiveGrant,
  GrantRequest,
  GrantContinuationRequest,
  NonInteractiveGrant,
  OutgoingPayment,
  OutgoingPaymentPaginationResult,
  PaymentPointer,
  JWK,
  AccessToken,
  Quote,
  IncomingPaymentPaginationResult
} from '../types'
import base64url from 'base64url'
import { v4 as uuid } from 'uuid'
import { ResponseValidator } from 'openapi'

export const silentLogger = createLogger({
  level: 'silent'
})

export const keyId = 'default-key-id'

export const defaultAxiosInstance = createAxiosInstance({
  requestTimeoutMs: 0,
  keyId,
  privateKey: generateKeyPairSync('ed25519').privateKey
})

export const withEnvVariableOverride = (
  override: Record<string, string>,
  testCallback: () => Promise<void>
): (() => Promise<void>) => {
  return async () => {
    const savedEnvVars = Object.assign({}, process.env)

    Object.assign(process.env, override)

    try {
      await testCallback()
    } finally {
      process.env = savedEnvVars
    }
  }
}

export const mockOpenApiResponseValidators = () => ({
  successfulValidator: ((data: unknown): data is unknown =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    true) as ResponseValidator<any>,
  failedValidator: ((data: unknown): data is unknown => {
    throw new Error('Failed to validate response')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as ResponseValidator<any>
})

export const mockJwk = (overrides?: Partial<JWK>): JWK => ({
  x: uuid(),
  kid: uuid(),
  alg: 'EdDSA',
  kty: 'OKP',
  crv: 'Ed25519',
  ...overrides
})

export const mockPaymentPointer = (
  overrides?: Partial<PaymentPointer>
): PaymentPointer => ({
  id: 'https://example.com/.well-known/pay',
  authServer: 'https://auth.wallet.example/authorize',
  assetScale: 2,
  assetCode: 'USD',
  ...overrides
})

export const mockILPStreamConnection = (
  overrides?: Partial<ILPStreamConnection>
): ILPStreamConnection => ({
  id: uuid(),
  sharedSecret: base64url('sharedSecret'),
  ilpAddress: 'test.ilpAddress',
  assetCode: 'USD',
  assetScale: 2,
  ...overrides
})

export const mockIncomingPayment = (
  overrides?: Partial<IncomingPayment>
): IncomingPayment => ({
  id: uuid(),
  paymentPointer: 'paymentPointer',
  completed: false,
  incomingAmount: {
    assetCode: 'USD',
    assetScale: 2,
    value: '10'
  },
  receivedAmount: {
    assetCode: 'USD',
    assetScale: 2,
    value: '0'
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ilpStreamConnection: mockILPStreamConnection(),
  ...overrides
})

export const mockIncomingPaymentPaginationResult = (
  overrides?: Partial<IncomingPaymentPaginationResult>
): IncomingPaymentPaginationResult => {
  const result = overrides?.result || [
    mockIncomingPayment(),
    mockIncomingPayment(),
    mockIncomingPayment()
  ]

  return {
    result,
    pagination: overrides?.pagination || {
      startCursor: result[0].id,
      hasNextPage: true,
      hasPreviousPage: true,
      endCursor: result[result.length - 1].id
    }
  }
}

export const mockOutgoingPayment = (
  overrides?: Partial<OutgoingPayment>
): OutgoingPayment => ({
  id: uuid(),
  paymentPointer: 'paymentPointer',
  failed: false,
  sendAmount: {
    assetCode: 'USD',
    assetScale: 2,
    value: '10'
  },
  sentAmount: {
    assetCode: 'USD',
    assetScale: 2,
    value: '0'
  },
  receiveAmount: {
    assetCode: 'USD',
    assetScale: 2,
    value: '10'
  },
  quoteId: uuid(),
  receiver: uuid(),
  description: 'some description',
  externalRef: 'INV #1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
})

export const mockOutgoingPaymentPaginationResult = (
  overrides?: Partial<OutgoingPaymentPaginationResult>
): OutgoingPaymentPaginationResult => {
  const result = overrides?.result || [
    mockOutgoingPayment(),
    mockOutgoingPayment(),
    mockOutgoingPayment()
  ]

  return {
    result,
    pagination: overrides?.pagination || {
      startCursor: result[0].id,
      hasNextPage: true,
      hasPreviousPage: true,
      endCursor: result[result.length - 1].id
    }
  }
}

export const mockInteractiveGrant = (
  overrides?: Partial<InteractiveGrant>
): InteractiveGrant => ({
  interact: {
    redirect: 'http://example.com/redirect',
    finish: 'EF5C2D8DF0663FD5'
  },
  continue: {
    access_token: {
      value: 'BBBDD7BDD6CB8659'
    },
    uri: 'http://example.com/continue',
    wait: 5
  },
  ...overrides
})

export const mockNonInteractiveGrant = (
  overrides?: Partial<NonInteractiveGrant>
): NonInteractiveGrant => ({
  access_token: {
    value: '99C36C2A4DB5BEBC',
    manage: 'http://example.com/token/',
    access: [
      {
        type: 'incoming-payment',
        actions: ['create', 'read', 'list', 'complete']
      }
    ],
    expires_in: 600
  },
  continue: {
    access_token: {
      value: 'DECCCF3D2229DB48'
    },
    uri: 'http://example.com/continue/'
  },
  ...overrides
})

export const mockGrantRequest = (
  overrides?: Partial<GrantRequest>
): GrantRequest => ({
  access_token: {
    access: [
      {
        type: 'quote',
        actions: ['create', 'read']
      }
    ]
  },
  client: 'https://shoe-shop/.well-known/pay',
  interact: {
    start: ['redirect'],
    finish: {
      method: 'redirect',
      uri: 'http://localhost:3030/mock-idp/fake-client',
      nonce: '456'
    }
  },
  ...overrides
})

export const mockContinuationRequest = (
  overrides?: Partial<GrantContinuationRequest>
): GrantContinuationRequest => ({
  interact_ref: uuid(),
  ...overrides
})

export const mockAccessToken = (
  overrides?: Partial<AccessToken>
): AccessToken => ({
  access_token: {
    value: '99C36C2A4DB5BEBC',
    manage: `http://example.com/token/${uuid()}`,
    access: [
      {
        type: 'incoming-payment',
        actions: ['create', 'read', 'list', 'complete']
      }
    ],
    expires_in: 600
  },
  ...overrides
})

export const mockQuote = (overrides?: Partial<Quote>): Quote => ({
  id: uuid(),
  receiver: `receiver`,
  paymentPointer: 'paymentPointer',
  sendAmount: {
    value: '100',
    assetCode: 'USD',
    assetScale: 2
  },
  receiveAmount: {
    value: '90',
    assetCode: 'USD',
    assetScale: 2
  },
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  ...overrides
})
