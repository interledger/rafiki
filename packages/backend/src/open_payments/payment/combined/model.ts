import { PaginationModel } from '../../../shared/baseModel'
import { IncomingPaymentState } from '../incoming/model'
import { OutgoingPaymentState } from '../outgoing/model'

// This model is for a view that combines incoming and outgoing payments for the purpose of pagination.
// You likely should use IncomingPayment and OutgoingPayment seperately for any other purpose.
// It should not be used for inserts/update/deletes.

export enum CombinedPaymentType {
  Incoming = 'INCOMING',
  Outgoing = 'OUTGOING'
}

export class CombinedPayment extends PaginationModel {
  public static readonly tableName = 'combinedPaymentsView'

  // unique to combinedPaymentsView
  public type!: CombinedPaymentType
  // common to both incoming and outgoing payments
  public state!: OutgoingPaymentState | IncomingPaymentState
  public metadata?: Record<string, unknown>
  // outgoing only fields
  public stateAttempts?: number
  public grantId?: string
  private sentAmountValue?: bigint
  public peerId?: string
  // incoming only fields
  public expiresAt?: Date
  public connectionId?: string
  public processAt?: Date | null
  public assetId?: string
  private incomingAmountValue?: bigint | null
  private receivedAmountValue?: bigint
}
