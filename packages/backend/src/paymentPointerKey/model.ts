import { BaseModel } from '../shared/baseModel'

import { JWKWithRequired } from 'auth'

export class PaymentPointerKey extends BaseModel {
  public static get tableName(): string {
    return 'paymentPointerKeys'
  }

  public id!: string
  public paymentPointerId!: string

  public jwk!: JWKWithRequired
}
