import { Model } from 'objection'
import { Account } from '../account/model'
import { BaseModel } from '../shared/baseModel'

export class Peer extends BaseModel {
  public static get tableName(): string {
    return 'peers'
  }

  static relationMappings = {
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'peers.accountId',
        to: 'accounts.id'
      }
    }
  }

  public accountId!: string
  public account!: Account & Required<Pick<Account, 'http' | 'routing'>>
}
