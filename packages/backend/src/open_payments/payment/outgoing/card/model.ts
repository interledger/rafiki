import { Pojo } from 'objection'
import { BaseModel } from '../../../../shared/baseModel'

export class OutgoingPaymentsCardDetails extends BaseModel {
  public static get tableName(): string {
    return 'outgoingPaymentCardDetails'
  }

  public expiry!: string
  public readonly outgoingPaymentId!: string
  public signature!: string

  $formatJson(json: Pojo): Pojo {
    json = super.$formatJson(json)
    return {
      ...json,
      expiry: json.expiry.toISOString()
    }
  }
}
