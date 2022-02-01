import { Model } from 'objection'
import { Account } from '../account/model'
import { Account as BaseAccount } from '../../accounting/service'
import { Asset } from '../../asset/model'
import { BaseModel } from '../../shared/baseModel'

export class Invoice extends BaseModel implements BaseAccount {
  public static get tableName(): string {
    return 'invoices'
  }

  static relationMappings = {
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'invoices.accountId',
        to: 'accounts.id'
      }
    }
  }

  // Open payments account id this invoice is for
  public accountId!: string
  public account!: Account
  public active!: boolean
  public description?: string
  public expiresAt!: Date
  public readonly amount!: bigint

  public processAt!: Date | null

  public webhookAttempts!: number

  public get asset(): Asset {
    return this.account.asset
  }
}
