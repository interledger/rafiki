import { BaseModel } from '../../../../shared/baseModel'

type OutgoingPaymentCardDetailsTableName = 'outgoingPaymentCardDetails'
type OutgoingPaymentIdColumnName = 'outgoingPaymentId'
type OutgoingPaymentIdRelation =
  `${OutgoingPaymentCardDetailsTableName}.${OutgoingPaymentIdColumnName}`
export const outgoingPaymentCardDetailsRelation: OutgoingPaymentIdRelation =
  'outgoingPaymentCardDetails.outgoingPaymentId'

type OutgoingPaymentCardDetailsType = {
  expiry: string
  signature: string
  requestId?: string
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

  public expiry!: string
  public readonly outgoingPaymentId!: string
  public signature!: string
  public requestId?: string
}
