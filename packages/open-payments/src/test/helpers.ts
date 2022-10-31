import createLogger from 'pino'
import { ILPStreamConnection } from '../../dist'
import { createAxiosInstance } from '../client/requests'
import { IncomingPayment } from '../types'
import base64url from 'base64url'
import { v4 as uuid } from 'uuid'

export const silentLogger = createLogger({
  level: 'silent'
})

export const defaultAxiosInstance = createAxiosInstance({ requestTimeoutMs: 0 })

export const mockILPStreamConnection = (
  overrides?: Partial<ILPStreamConnection>
): ILPStreamConnection => ({
  id: uuid(),
  sharedSecret: base64url('sharedSecret'),
  ilpAddress: 'ilpAddress',
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
