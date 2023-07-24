import { Model } from 'objection'
import { PaginationModel } from '../../../shared/baseModel'
import { IncomingPayment, IncomingPaymentState } from '../incoming/model'
import { OutgoingPayment, OutgoingPaymentState } from '../outgoing/model'
import { Asset } from '../../../asset/model'

// This model is for a view that combines incoming and outgoing payments for the purpose of pagination.
// You likely should use IncomingPayment and OutgoingPayment seperately for any other purpose.
// It cannot and should not be used for inserts/update/deletes.

export enum PaymentType {
  Incoming = 'INCOMING',
  Outgoing = 'OUTGOING'
}

export interface Payment {
  type: PaymentType
  payment: IncomingPayment | OutgoingPayment
}

export class CombinedPayment extends PaginationModel {
  public static readonly tableName = 'combinedPaymentsView'

  // unique to combinedPaymentsView
  public type!: PaymentType
  // common to both incoming and outgoing payments
  public id!: string
  public state!: OutgoingPaymentState | IncomingPaymentState
  public paymentPointerId!: string
  public metadata?: Record<string, unknown>
  public client?: string
  public createdAt!: Date
  public updatedAt!: Date
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
