import { BaseModel } from '../shared/baseModel'

export class ApiKey extends BaseModel {
  public static get tableName(): string {
    return 'apiKeys'
  }

  public paymentPointerId!: string // Refers to which payment pointer this API key is for
  public hashedKey!: string // Refers to the bcrypted API key
}
