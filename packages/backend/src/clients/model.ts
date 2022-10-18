import { Model } from 'objection'
import { ClientKeys } from '../clientKeys/model'
import { BaseModel } from '../shared/baseModel'

export class Client extends BaseModel {
  public static get tableName(): string {
    return 'clients'
  }

  public paymentPointerUrl!: string

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  static relationMappings = () => ({
    keys: {
      relation: Model.HasManyRelation,
      modelClass: ClientKeys,
      join: {
        from: 'clients.id',
        to: 'clientKeys.clientId'
      }
    }
  })
  public keys!: ClientKeys[]

  public name!: string
  public uri!: string
  public image!: string
  public email!: string
}
