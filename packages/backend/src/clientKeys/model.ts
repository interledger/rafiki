import { BaseModel } from '../shared/baseModel'

import { JWKWithRequired } from 'auth'

export class ClientKeys extends BaseModel {
  public static get tableName(): string {
    return 'clientKeys'
  }

  // The id should be the same as the id in the kid.
  public id!: string
  public paymentPointerId!: string

  public jwk!: JWKWithRequired
}
