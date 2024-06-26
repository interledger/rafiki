import { validateId } from '../../shared/utils'
import { Transfer as TbTransfer } from 'tigerbeetle-node/dist/bindings'
import { LedgerTransfer } from '../service'

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

export function hexTextToBigInt(hex: string): bigint {
  return BigInt(`0x${hex}`)
}

export function fromTigerBeetleId(bi: bigint): string {
  let str = bi.toString(16)
  while (str.length < 32) str = '0' + str

  if (str.length === 32)
    str =
      str.substring(0, 8) +
      '-' +
      str.substring(8, 12) +
      '-' +
      str.substring(12, 16) +
      '-' +
      str.substring(16, 20) +
      '-' +
      str.substring(20)
  return str
}

export function tbTransferToLedgerTransfer(
  tbTransfer: TbTransfer
): LedgerTransfer {
  return {
    amount: tbTransfer.amount,
    creditAccount: fromTigerBeetleId(tbTransfer.credit_account_id),
    debitAccount: fromTigerBeetleId(tbTransfer.debit_account_id),
    timeout: tbTransfer.timeout,
    timestamp: tbTransfer.timestamp
    //TODO need to convert the rest...
  }
}
