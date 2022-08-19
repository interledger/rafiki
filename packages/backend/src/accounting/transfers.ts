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

export interface CreateTransferOptions {
  id?: string | bigint
  sourceAccountId: AccountId
  destinationAccountId: AccountId
  amount: bigint
  ledger: number
  timeout?: bigint
  pendingId?: string | bigint
}

export async function createTransfers(
  deps: ServiceDependencies,
  transfers: CreateTransferOptions[],
  commit?: boolean
): Promise<void | TransfersError> {
  const tbTransfers: TbTransfer[] = []
  for (let i = 0; i < transfers.length; i++) {
    const transfer = transfers[i]
    if (transfer.amount <= BigInt(0)) {
      return { index: i, error: TransferError.InvalidAmount }
    }
    let flags = 0
    if (transfer.timeout) {
      flags |= TransferFlags.pending
    }
    if (transfer.pendingId && commit === true) {
      flags |= TransferFlags.post_pending_transfer
      transfer.id = uuid()
    } else if (transfer.pendingId && commit === false) {
      flags |= TransferFlags.void_pending_transfer
      transfer.id = uuid()
    } else {
      transfer.pendingId = 0n
    }
    if (i < transfers.length - 1) {
      flags |= TransferFlags.linked
    }
    tbTransfers.push({
      id: toTigerbeetleId(transfers[i].id || uuid()),
      debit_account_id: toTigerbeetleId(transfer.sourceAccountId),
      credit_account_id: toTigerbeetleId(transfer.destinationAccountId),
      user_data: 0n,
      reserved: 0n,
      pending_id: transfer.pendingId ? toTigerbeetleId(transfer.pendingId) : 0n,
      timeout: transfer.timeout ? transfer.timeout * BigInt(10e6) : 0n, // ms -> ns
      ledger: transfer.ledger,
      code: ACCOUNT_TYPE,
      flags,
      amount: transfer.amount,
      timestamp: 0n
    })
  }
  const res = await deps.tigerbeetle.createTransfers(tbTransfers)
  for (const { index, code } of res) {
    switch (code) {
      case CreateTransferErrorCode.linked_event_failed:
        break
      // 1st phase
      // TODO @jason: This needs to be removed: =========>
      case 13: //debit_account_not_found,
        return { index, error: TransferError.UnknownSourceAccount }
      case 14: //credit_account_not_found,
        return { index, error: TransferError.UnknownDestinationAccount }
      case 17: //exists_with_different_flags,
        return { index, error: TransferError.TransferExists }
      case 32: //exceeds_credits
        return { index, error: TransferError.InsufficientBalance }
      case 33: //exceeds_debits
        return { index, error: TransferError.InsufficientDebitBalance }
      // TODO @jason: stop ==============================>
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
          error: commit
            ? TransferError.AlreadyCommitted
            : TransferError.AlreadyRolledBack
        }
      case CreateTransferErrorCode.pending_transfer_already_posted:
        return { index, error: TransferError.AlreadyCommitted }
      case CreateTransferErrorCode.pending_transfer_already_voided:
        return { index, error: TransferError.AlreadyRolledBack }
      default:
        // TODO @jason: This needs to be removed: =========>
        switch (code) {
          case 39:
            return { index, error: TransferError.UnknownTransfer } //pending_transfer_not_found
          case 40:
            return {
              //pending_transfer_not_pending
              index,
              error: commit
                ? TransferError.AlreadyCommitted
                : TransferError.AlreadyRolledBack
            }
          case 47:
            return { index, error: TransferError.AlreadyCommitted } //pending_transfer_already_posted,
          case 48:
            return { index, error: TransferError.AlreadyRolledBack } //pending_transfer_already_voided,
        }

        if (commit === true || commit == false) {
          const lookupIds = tbTransfers.map((ac) => ac.pending_id)
          const existingTransfers = await deps.tigerbeetle.lookupTransfers(
            lookupIds
          )
          console.log(existingTransfers)
        }

        // TODO @jason: stop ==============================>

        throw new CreateTransferError(code)
    }
  }
}
