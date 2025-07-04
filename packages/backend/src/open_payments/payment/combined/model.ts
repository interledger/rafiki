import { PaginationModel } from '../../../shared/baseModel'
import { IncomingPaymentState } from '../incoming/model'
import { OutgoingPaymentState } from '../outgoing/model'

// This model is for a view that combines incoming and outgoing payments for the purpose of pagination.
// You likely should use IncomingPayment and OutgoingPayment separately for any other purpose.
// It cannot and should not be used for inserts/update/deletes.

export enum PaymentType {
  Incoming = 'INCOMING',
  Outgoing = 'OUTGOING'
}

export class CombinedPayment extends PaginationModel {
  public static readonly tableName = 'combinedPaymentsView'

  // unique to combinedPaymentsView
  public type!: PaymentType
  // common to both incoming and outgoing payments
  public id!: string
  public state!: OutgoingPaymentState | IncomingPaymentState
  public walletAddressId!: string
  public metadata?: Record<string, unknown>
  public tenantId!: string
  public client?: string
  public createdAt!: Date
  public updatedAt!: Date
}
