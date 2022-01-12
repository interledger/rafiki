import { Model, ModelOptions, QueryContext } from 'objection'
import { v4 as uuid } from 'uuid'
import { Account } from '../account/model'
import { BaseModel } from '../../shared/baseModel'

export class Invoice extends BaseModel {
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
  // The "| null" is necessary so that `$beforeUpdate` can modify a patch to remove the webhookId. If `$beforeUpdate` set `webhookId = undefined`, the patch would ignore the modification.
  public webhookId?: string | null
  public webhookAttempts!: number

  $beforeUpdate(opts: ModelOptions, queryContext: QueryContext): void {
    super.$beforeUpdate(opts, queryContext)
    if (opts.old && opts.old['active'] === true && this.active === false) {
      this.webhookId = uuid()
    }
  }
}
