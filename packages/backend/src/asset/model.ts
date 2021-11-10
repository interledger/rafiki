import { Model, RelationMappings } from 'objection'
import { Account } from '../account/model'
import { BaseModel } from '../shared/baseModel'

export class Asset extends BaseModel {
  public static get tableName(): string {
    return 'assets'
  }

  static relationMappings = (): RelationMappings => ({
    liquidityAccount: {
      relation: Model.HasOneThroughRelation,
      modelClass: Account,
      join: {
        from: 'assets.id',
        through: {
          from: 'assetAccounts.id',
          to: 'assetAccounts.liquidityAccountId'
        },
        to: 'accounts.id'
      }
    },
    settlementAccount: {
      relation: Model.HasOneThroughRelation,
      modelClass: Account,
      join: {
        from: 'assets.id',
        through: {
          from: 'assetAccounts.id',
          to: 'assetAccounts.settlementAccountId'
        },
        to: 'accounts.id'
      }
    },
    sentAccount: {
      relation: Model.HasOneThroughRelation,
      modelClass: Account,
      join: {
        from: 'assets.id',
        through: {
          from: 'assetAccounts.id',
          to: 'assetAccounts.sentAccountId'
        },
        to: 'accounts.id'
      }
    },
    receiveLimitAccount: {
      relation: Model.HasOneThroughRelation,
      modelClass: Account,
      join: {
        from: 'assets.id',
        through: {
          from: 'assetAccounts.id',
          to: 'assetAccounts.receiveLimitAccountId'
        },
        to: 'accounts.id'
      }
    }
  })

  async getLiquidityAccount(): Promise<Account> {
    // $relatedQuery returns an array query builder even if the
    // property type is a model and not an array of models.
    const account = ((await this.$relatedQuery(
      'liquidityAccount'
    )) as unknown) as Account
    account.asset = this
    return account
  }

  async getSettlementAccount(): Promise<Account> {
    const account = ((await this.$relatedQuery(
      'settlementAccount'
    )) as unknown) as Account
    account.asset = this
    return account
  }

  async getSentAccount(): Promise<Account> {
    const account = ((await this.$relatedQuery(
      'sentAccount'
    )) as unknown) as Account
    account.asset = this
    return account
  }

  async getReceiveLimitAccount(): Promise<Account> {
    const account = ((await this.$relatedQuery(
      'receiveLimitAccount'
    )) as unknown) as Account
    account.asset = this
    return account
  }

  public readonly code!: string
  public readonly scale!: number

  // TigerBeetle account 2 byte unit field representing account's asset
  public readonly unit!: number
}

export class AssetAccounts extends BaseModel {
  public static get tableName(): string {
    return 'assetAccounts'
  }

  static relationMappings = (): RelationMappings => ({
    liquidityAccount: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'assetAccounts.liquidityAccountId',
        to: 'accounts.id'
      }
    }
  })

  // Account tracking liquidity balance
  public liquidityAccountId!: string
  public liquidityAccount?: Account
  // Account tracking settlement balance
  public settlementAccountId!: string
  // Account tracking outgoing payments total sent
  public sentAccountId!: string
  // Account tracking cumulative invoice receive limit
  public receiveLimitAccountId!: string
}
