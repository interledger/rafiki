import { BaseModel } from '../../../../shared/baseModel'

type OutgoingPaymentCardDetailsTableName = 'outgoingPaymentCardDetails'
type OutgoingPaymentIdColumnName = 'outgoingPaymentId'
type OutgoingPaymentIdRelation =
  `${OutgoingPaymentCardDetailsTableName}.${OutgoingPaymentIdColumnName}`
export const outgoingPaymentCardDetailsRelation: OutgoingPaymentIdRelation =
  'outgoingPaymentCardDetails.outgoingPaymentId'

type OutgoingPaymentCardDetailsType = {
  requestId: string
  data: Record<string, unknown>
  initiatedAt: Date
} & {
  [key in OutgoingPaymentIdColumnName]: string
}

export class OutgoingPaymentCardDetails
  extends BaseModel
  implements OutgoingPaymentCardDetailsType
{
  public static get tableName(): OutgoingPaymentCardDetailsTableName {
    return 'outgoingPaymentCardDetails'
  }

  public readonly outgoingPaymentId!: string
  public requestId!: string
  public data!: Record<string, unknown>
  public initiatedAt!: Date
}
