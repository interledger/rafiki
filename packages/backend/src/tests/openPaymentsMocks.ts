import { v4 as uuid } from 'uuid'
import base64url from 'base64url'
import {
  ILPStreamConnection,
  IncomingPayment,
  PaymentPointer,
  InteractiveGrant,
  NonInteractiveGrant
} from 'open-payments'

export const mockILPStreamConnection = (
  overrides?: Partial<ILPStreamConnection>
): ILPStreamConnection => ({
  id: uuid(),
  sharedSecret: base64url('sharedSecret'),
  ilpAddress: 'test.ilpAdress',
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

export const mockPaymentPointer = (
  overrides?: Partial<PaymentPointer>
): PaymentPointer => ({
  id: 'https://example.com/.well-known/pay',
  authServer: 'https://auth.wallet.example/authorize',
  assetScale: 2,
  assetCode: 'USD',
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
