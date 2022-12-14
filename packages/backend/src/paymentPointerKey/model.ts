import { BaseModel } from '../shared/baseModel'

import { JWK } from 'http-signature-utils'

export class PaymentPointerKey extends BaseModel {
  public static get tableName(): string {
    return 'paymentPointerKeys'
  }

  public id!: string
  public paymentPointerId!: string

  public jwk!: JWK
}
