
import { BaseModel } from "../../../../shared/baseModel"

export class OutgoingPaymentsCardDetails extends BaseModel {
  public static get tableName(): string {
    return 'outgoingPaymentsCardDetails'
  }

  public readonly expiry!: string
  public readonly outgoingPaymentId!: string
  public signature!: string
}

