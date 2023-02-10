import { Model } from 'objection'
import { Asset } from '../../../asset/model'
import { BaseModel } from '../../../shared/baseModel'
import { LedgerAccount } from '../ledger-account/model'

export enum LedgerTransferState {
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  VOIDED = 'VOIDED'
}

export enum LedgerTransferType {
  WITHDRAWAL = 'WITHDRAWAL',
  DEPOSIT = 'DEPOSIT'
}

export class LedgerTransfer extends BaseModel {
  public static get tableName(): string {
    return 'ledgerTransfers'
  }

  public readonly creditAccountId!: string
  public readonly creditAccount?: LedgerAccount
  public readonly debitAccountId!: string
  public readonly debitAccount?: LedgerAccount

  public readonly transferRef!: string

  public readonly amount!: bigint

  public readonly ledger!: number
  public readonly asset?: Asset

  public readonly expiresAt?: Date
  public readonly state!: LedgerTransferState
  public readonly type?: LedgerTransferType

  static relationMappings = {
    asset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'ledgerTransfers.ledger',
        to: 'assets.ledger'
      }
    },
    creditAccount: {
      relation: Model.HasOneRelation,
      modelClass: LedgerAccount,
      join: {
        from: 'ledgerTransfers.creditAccountId',
        to: 'ledgerAccounts.id'
      }
    },
    debitAccount: {
      relation: Model.HasOneRelation,
      modelClass: LedgerAccount,
      join: {
        from: 'ledgerTransfers.debitAccountId',
        to: 'ledgerAccounts.id'
      }
    }
  }
}
