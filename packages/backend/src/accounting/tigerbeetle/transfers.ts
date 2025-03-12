import {
  CreateTransferError as CreateTransferErrorCode,
  Transfer as TbTransfer,
  TransferFlags,
  AccountFilter,
  AccountFilterFlags
} from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'
import { TransferError } from '../errors'

import { TigerbeetleCreateTransferError } from './errors'
import { ServiceDependencies, TigerBeetleTransferCode } from './service'
import { AccountId, toTigerBeetleId, tbTransferToLedgerTransfer } from './utils'
import { GetLedgerTransfersResult } from '../service'

type TransfersError = {
  index: number
  error: TransferError
}

export type TransferUserData128 = string | number | bigint

const TB_AMOUNT_MAX = BigInt(2n ** 128n - 1n)
const TB_AMOUNT_MIN = 0n

interface TransferOptions {
  transferRef?: TransferUserData128
  code?: TigerBeetleTransferCode
}

export interface NewTransferOptions extends TransferOptions {
  id: string | bigint
  sourceAccountId: AccountId
  destinationAccountId: AccountId
  amount: bigint
  ledger: number
  timeout?: number
  postId?: never
  voidId?: never
}

export interface PostTransferOptions extends TransferOptions {
  id?: never
  postId: string | bigint
  voidId?: never
}

export interface VoidTransferOptions extends TransferOptions {
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
      user_data_32: 0,
      user_data_64: 0n,
      user_data_128: 0n,
      pending_id: 0n,
      timeout: 0,
      ledger: 0,
      code: TigerBeetleTransferCode.TRANSFER,
      flags: 0,
      amount: 0n,
      timestamp: 0n
    }
    if (isNewTransferOptions(transfer)) {
      if (transfer.amount <= 0n)
        return { index: i, error: TransferError.InvalidAmount }

      tbTransfer.id = toTigerBeetleId(transfer.id)
      tbTransfer.amount = transfer.amount
      tbTransfer.ledger = transfer.ledger
      tbTransfer.debit_account_id = toTigerBeetleId(transfer.sourceAccountId)
      tbTransfer.credit_account_id = toTigerBeetleId(
        transfer.destinationAccountId
      )
      if (transfer.timeout) {
        tbTransfer.flags |= TransferFlags.pending
        tbTransfer.timeout = transfer.timeout
      }
      if (transfer.code) tbTransfer.code = transfer.code
    } else {
      tbTransfer.code = 0 //use the same code as the new transfer.
      tbTransfer.id = toTigerBeetleId(uuid())
      if (transfer.postId) {
        tbTransfer.flags |= TransferFlags.post_pending_transfer
        tbTransfer.pending_id = toTigerBeetleId(transfer.postId)
        // We only support setting the posting transfer amount to match the pending transfer:
        // https://docs.tigerbeetle.com/reference/transfer/#amount
        tbTransfer.amount = TB_AMOUNT_MAX
      } else if (transfer.voidId) {
        tbTransfer.flags |= TransferFlags.void_pending_transfer
        tbTransfer.pending_id = toTigerBeetleId(transfer.voidId)
        // We only support setting the void transfer amount to match the pending transfer:
        // https://docs.tigerbeetle.com/reference/transfer/#amount
        tbTransfer.amount = TB_AMOUNT_MIN
      }
    }

    if (transfer.transferRef)
      tbTransfer.user_data_128 = toTigerBeetleId(transfer.transferRef)

    if (i < transfers.length - 1) tbTransfer.flags |= TransferFlags.linked
    tbTransfers.push(tbTransfer)
  }
  const res = await deps.tigerBeetle.createTransfers(tbTransfers)
  for (const { index, result } of res) {
    switch (result) {
      case CreateTransferErrorCode.linked_event_failed:
        break
      // 1st phase
      case CreateTransferErrorCode.exists:
      case CreateTransferErrorCode.exists_with_different_debit_account_id:
      case CreateTransferErrorCode.exists_with_different_credit_account_id:
      case CreateTransferErrorCode.exists_with_different_user_data_32:
      case CreateTransferErrorCode.exists_with_different_user_data_64:
      case CreateTransferErrorCode.exists_with_different_user_data_128:
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
        throw new TigerbeetleCreateTransferError(result)
    }
  }
}

export async function getAccountTransfers(
  deps: ServiceDependencies,
  id: string | number,
  limit: number = 20
): Promise<GetLedgerTransfersResult> {
  const account_id = toTigerBeetleId(id)
  const filter: AccountFilter = {
    account_id,
    timestamp_min: 0n,
    timestamp_max: 0n,
    limit,
    flags: AccountFilterFlags.credits | AccountFilterFlags.debits,
    code: 0, //disabled
    user_data_32: 0, //disabled
    user_data_64: 0n, //disabled
    user_data_128: 0n //disabled
  }
  const tbAccountTransfers: TbTransfer[] =
    await deps.tigerBeetle.getAccountTransfers(filter)
  const returnVal: GetLedgerTransfersResult = {
    credits: [],
    debits: []
  }
  tbAccountTransfers.forEach((item) => {
    const converted = tbTransferToLedgerTransfer(item)
    if (item.debit_account_id === account_id) returnVal.debits.push(converted)
    else returnVal.credits.push(converted)
  })
  return returnVal
}
