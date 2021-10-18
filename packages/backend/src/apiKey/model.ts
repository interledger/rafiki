import { BaseModel } from '../shared/baseModel'

export class ApiKey extends BaseModel {
  public static get tableName(): string {
    return 'apikeys'
  }

  public accountId!: string // Refers to which account this API key is for
  public hashedKey!: string // Refers to the bcrypted API key
  public key?: string // Refers to the API key
}
