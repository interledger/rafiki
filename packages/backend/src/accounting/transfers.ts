import {
  CreateTransferError as CreateTransferErrorCode,
  Transfer as TbTransfer,
  TransferFlags
} from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { CreateTransferError, TransferError } from './errors'
import { ServiceDependencies } from './service'
import { AccountId, toTigerbeetleId } from './utils'

const ACCOUNT_TYPE = 1

type TransfersError = {
  index: number
  error: TransferError
}

export interface NewTransferOptions {
  id: string | bigint
  sourceAccountId: AccountId
  destinationAccountId: AccountId
  amount: bigint
  ledger: number
  timeout?: bigint
  postId?: never
  voidId?: never
}

export interface PostTransferOptions {
  id?: never
  postId: string | bigint
  voidId?: never
}

export interface VoidTransferOptions {
  id?: never
  postId?: never
  voidId: string | bigint
}

function isNewTransferOptions(
  options: CreateTransferOptions
): options is NewTransferOptions {
  return options.id !== undefined
}

export type CreateTransferOptions =
  | NewTransferOptions
  | PostTransferOptions
  | VoidTransferOptions

export async function createTransfers(
  deps: ServiceDependencies,
  transfers: CreateTransferOptions[]
): Promise<void | TransfersError> {
  const tbTransfers: TbTransfer[] = []
  for (let i = 0; i < transfers.length; i++) {
    const transfer = transfers[i]
    const tbTransfer: TbTransfer = {
      id: 0n,
      debit_account_id: 0n,
      credit_account_id: 0n,
      user_data: 0n,
      reserved: 0n,
      pending_id: 0n,
      timeout: 0n,
      ledger: 0,
      code: ACCOUNT_TYPE,
      flags: 0,
      amount: 0n,
      timestamp: 0n
    }
    if (isNewTransferOptions(transfer)) {
      if (transfer.amount <= BigInt(0)) {
        return { index: i, error: TransferError.InvalidAmount }
      }
      tbTransfer.id = toTigerbeetleId(transfer.id)
      tbTransfer.amount = transfer.amount
      tbTransfer.ledger = transfer.ledger
      tbTransfer.debit_account_id = toTigerbeetleId(transfer.sourceAccountId)
      tbTransfer.credit_account_id = toTigerbeetleId(
        transfer.destinationAccountId
      )
      if (transfer.timeout) {
        tbTransfer.flags |= TransferFlags.pending
        tbTransfer.timeout = transfer.timeout * BigInt(10e6) // ms -> ns
      }
    } else {
      tbTransfer.id = toTigerbeetleId(uuid())
      if (transfer.postId) {
        tbTransfer.flags |= TransferFlags.post_pending_transfer
        tbTransfer.pending_id = toTigerbeetleId(transfer.postId)
      } else if (transfer.voidId) {
        tbTransfer.flags |= TransferFlags.void_pending_transfer
        tbTransfer.pending_id = toTigerbeetleId(transfer.voidId)
      }
    }
    if (i < transfers.length - 1) {
      tbTransfer.flags |= TransferFlags.linked
    }
    tbTransfers.push(tbTransfer)
  }
  const res = await deps.tigerbeetle.createTransfers(tbTransfers)
  for (const { index, code } of res) {
    switch (code) {
      case CreateTransferErrorCode.linked_event_failed:
        break
      // 1st phase
      case CreateTransferErrorCode.exists:
      case CreateTransferErrorCode.exists_with_different_debit_account_id:
      case CreateTransferErrorCode.exists_with_different_credit_account_id:
      case CreateTransferErrorCode.exists_with_different_user_data:
      case CreateTransferErrorCode.exists_with_different_pending_id:
      case CreateTransferErrorCode.exists_with_different_code:
      case CreateTransferErrorCode.exists_with_different_amount:
      case CreateTransferErrorCode.exists_with_different_timeout:
      case CreateTransferErrorCode.exists_with_different_flags:
        return { index, error: TransferError.TransferExists }
      case CreateTransferErrorCode.accounts_must_be_different:
        return { index, error: TransferError.SameAccounts }
      case CreateTransferErrorCode.debit_account_not_found:
        return { index, error: TransferError.UnknownSourceAccount }
      case CreateTransferErrorCode.credit_account_not_found:
        return { index, error: TransferError.UnknownDestinationAccount }
      case CreateTransferErrorCode.exceeds_credits:
        return { index, error: TransferError.InsufficientBalance }
      case CreateTransferErrorCode.exceeds_debits:
        return { index, error: TransferError.InsufficientDebitBalance }
      case CreateTransferErrorCode.accounts_must_have_the_same_ledger:
        return { index, error: TransferError.DifferentAssets }
      // 2nd phase
      case CreateTransferErrorCode.pending_transfer_not_found:
        return { index, error: TransferError.UnknownTransfer }
      case CreateTransferErrorCode.pending_transfer_expired:
        return { index, error: TransferError.TransferExpired }
      case CreateTransferErrorCode.pending_transfer_not_pending:
        return {
          index,
          error: transfers[index].postId
            ? TransferError.AlreadyPosted
            : TransferError.AlreadyVoided
        }
      case CreateTransferErrorCode.pending_transfer_already_posted:
        return { index, error: TransferError.AlreadyPosted }
      case CreateTransferErrorCode.pending_transfer_already_voided:
        return { index, error: TransferError.AlreadyVoided }
      default:
        throw new CreateTransferError(code)
    }
  }
}
