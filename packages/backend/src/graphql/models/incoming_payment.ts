import { Amount } from '../../open_payments/payment/amount'
import { IncomingPaymentState } from '../../open_payments/payment/incoming/model'

export interface IncomingPaymentModel {
  id: string
  description?: string
  createdAt: string
  expiresAt: string
  incomingAmount?: Amount
  receivedAmount: Omit<Amount, 'value'>
  externalRef?: string
  state: IncomingPaymentState
}
