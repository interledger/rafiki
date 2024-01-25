import {
  CreateAccountError as CreateAccountErrorCode,
  CreateTransferError as CreateTransferErrorCode
} from 'tigerbeetle-node'
import { AccountId } from './utils'

export class TigerbeetleCreateAccountError extends Error {
  constructor(public code: number) {
    super(`TigerBeetle error code: ${code}`)
    this.name = 'TigerbeetleCreateAccountError'
  }
}

export class TigerbeetleUnknownAccountError extends Error {
  constructor(accountId: AccountId) {
    super(`Account not found. accountId: ${accountId}`)
    this.name = 'UnknownAccountError'
  }
}

export class TigerbeetleCreateTransferError extends Error {
  constructor(public code: CreateTransferErrorCode) {
    super()
    this.name = 'CreateTransferError'
  }
}

export function areAllAccountExistsErrors(
  errors: CreateAccountErrorCode[]
): boolean {
  return areAllOfTypeAccountErrors(errors, [
    CreateAccountErrorCode.exists_with_different_flags,
    CreateAccountErrorCode.exists_with_different_user_data_32,
    CreateAccountErrorCode.exists_with_different_user_data_64,
    CreateAccountErrorCode.exists_with_different_user_data_128,
    CreateAccountErrorCode.exists_with_different_ledger,
    CreateAccountErrorCode.exists_with_different_code,
    CreateAccountErrorCode.exists
  ])
}

export function areAllOfTypeAccountErrors(
  errorsOccurred: CreateAccountErrorCode[],
  errToVerify: CreateAccountErrorCode[]
): boolean {
  for (const occurred of errorsOccurred) {
    if (!errToVerify.includes(occurred)) return false
  }
  return true
}
