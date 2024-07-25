import { v4 as uuid } from 'uuid'
import { Model, QueryContext } from 'objection'
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

  public transferRef!: string

  public readonly amount!: bigint

  public readonly ledger!: number
  public readonly asset?: Asset

  public readonly expiresAt?: Date
  public readonly state!: LedgerTransferState
  public readonly type?: LedgerTransferType

  public $beforeInsert(context: QueryContext): void {
    super.$beforeInsert(context)
    this.transferRef = this.transferRef || uuid()
  }

  public get isPosted(): boolean {
    return this.state === LedgerTransferState.POSTED
  }

  public get isVoided(): boolean {
    return this.state === LedgerTransferState.VOIDED
  }

  public get isExpired(): boolean {
    return (
      this.state === LedgerTransferState.PENDING &&
      !!this.expiresAt &&
      this.expiresAt <= new Date()
    )
  }

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
