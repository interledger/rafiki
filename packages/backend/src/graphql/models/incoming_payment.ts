import {
  IncomingPaymentState,
  Amount
} from '../../open_payments/payment/incoming/model'

export interface IncomingPaymentModel {
  id: string
  description?: string
  createdAt: string
  expiresAt: string
  incomingAmount?: Amount
  receivedAmount: Omit<Amount, 'amount'>
  externalRef?: string
  state: IncomingPaymentState
}
