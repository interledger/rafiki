import { validateId } from '../../shared/utils'
import { Transfer as TbTransfer, TransferFlags } from 'tigerbeetle-node'
import { LedgerTransfer, LedgerTransferState, TransferType } from '../service'
import { TigerBeetleTransferCode } from './service'

export type AccountId = string | number | bigint
export type AccountUserData128 = AccountId

export function toTigerBeetleId(id: AccountId): bigint {
  if (typeof id === 'number') return BigInt(id)
  else if (typeof id === 'bigint') return id
  else if (!validateId(id)) throw new Error('wrong format of id')
  return uuidToBigInt(id)
}

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}

export function fromTigerBeetleId(bi: bigint): string {
  let str = bi.toString(16)
  while (str.length < 32) str = '0' + str

  if (str.length === 32) {
    str = `${str.substring(0, 8)}-${str.substring(8, 12)}-${str.substring(12, 16)}-${str.substring(16, 20)}-${str.substring(20)}`
  }
  return str
}

function transferTypeFromCode(code: number): TransferType {
  switch (code) {
    case TigerBeetleTransferCode.TRANSFER:
      return TransferType.TRANSFER
    case TigerBeetleTransferCode.DEPOSIT:
      return TransferType.DEPOSIT
    case TigerBeetleTransferCode.WITHDRAWAL:
      return TransferType.WITHDRAWAL
    default:
      throw new Error(`Transfer type code '${code}' is not mapped!`)
  }
}

export function tbTransferToLedgerTransfer(
  tbTransfer: TbTransfer
): LedgerTransfer {
  let state
  const flags = tbTransfer.flags
  if (TransferFlags.pending & flags) state = LedgerTransferState.PENDING
  else if (TransferFlags.void_pending_transfer & flags)
    state = LedgerTransferState.VOIDED
  else state = LedgerTransferState.POSTED

  return {
    id: fromTigerBeetleId(tbTransfer.id),
    amount: tbTransfer.amount,
    creditAccountId: fromTigerBeetleId(tbTransfer.credit_account_id),
    debitAccountId: fromTigerBeetleId(tbTransfer.debit_account_id),
    timeout: tbTransfer.timeout,
    timestamp: tbTransfer.timestamp / 1_000_000n, // Nanoseconds to Milliseconds
    transferRef: fromTigerBeetleId(tbTransfer.user_data_128),
    type: transferTypeFromCode(tbTransfer.code),
    state: state,
    ledger: tbTransfer.ledger,
    expiresAt: expiresAtFromTimestampAndTimeout(
      tbTransfer.timestamp,
      tbTransfer.timeout
    )
  }
}

function expiresAtFromTimestampAndTimeout(
  timestamp: bigint,
  timeout: number
): Date | undefined {
  return timeout
    ? new Date(Number(timestamp / 1_000_000n) + timeout * 1000)
    : undefined
}
