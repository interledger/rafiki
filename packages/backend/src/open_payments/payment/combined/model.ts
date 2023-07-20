import { PaginationModel } from '../../../shared/baseModel'
import { IncomingPayment, IncomingPaymentState } from '../incoming/model'
import { OutgoingPayment, OutgoingPaymentState } from '../outgoing/model'

// This model is for a view that combines incoming and outgoing payments for the purpose of pagination.
// You likely should use IncomingPayment and OutgoingPayment seperately for any other purpose.
// It cannot and should not be used for inserts/update/deletes.

export enum CombinedPaymentType {
  Incoming = 'INCOMING',
  Outgoing = 'OUTGOING'
}

export class CombinedPayment extends PaginationModel {
  public static readonly tableName = 'combinedPaymentsView'

  // unique to combinedPaymentsView
  public type!: CombinedPaymentType
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

  public toPayment(): IncomingPayment | OutgoingPayment {
    if (this.type === CombinedPaymentType.Incoming) {
      return IncomingPayment.fromJson({
        expiresAt: this.expiresAt,
        connectionId: this.connectionId,
        processAt: this.processAt,
        assetId: this.assetId,
        incomingAmountValue: this.incomingAmountValue,
        receivedAmountValue: this.receivedAmountValue,
        metadata: this.metadata,
        state: this.state as IncomingPaymentState,
        paymentPointerId: this.paymentPointerId,
        client: this.client,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
      })
    } else {
      return OutgoingPayment.fromJson({
        stateAttempts: this.stateAttempts,
        grantId: this.grantId,
        sentAmount: this.sentAmountValue,
        peerId: this.peerId,
        metadata: this.metadata,
        state: this.state as OutgoingPaymentState,
        paymentPointerId: this.paymentPointerId,
        client: this.client,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
      })
    }
  }
}
