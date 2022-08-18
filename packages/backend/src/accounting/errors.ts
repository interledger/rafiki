import { CreateTransferError as CreateTransferErrorCode } from 'tigerbeetle-node'

import { AccountId } from './utils'
import { CreateAccountError as CreateAccountErrorCode } from 'tigerbeetle-node'

export class CreateAccountError extends Error {
  constructor(public codes: number[]) {
    super()
    this.name = 'CreateAccountError'
  }
}

export class CreateTransferError extends Error {
  constructor(public code: CreateTransferErrorCode) {
    super()
    this.name = 'CreateTransferError'
  }
}

export enum TransferError {
  AlreadyCommitted = 'AlreadyCommitted',
  AlreadyRolledBack = 'AlreadyRolledBack',
  DifferentAssets = 'DifferentAssets',
  InsufficientBalance = 'InsufficientBalance',
  InsufficientDebitBalance = 'InsufficientDebitBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InvalidAmount = 'InvalidAmount',
  InvalidId = 'InvalidId',
  InvalidSourceAmount = 'InvalidSourceAmount',
  InvalidDestinationAmount = 'InvalidDestinationAmount',
  SameAccounts = 'SameAccounts',
  TransferExists = 'TransferExists',
  TransferExpired = 'TransferExpired',
  UnknownTransfer = 'UnknownTransfer',
  UnknownSourceAccount = 'UnknownSourceAccount',
  UnknownDestinationAccount = 'UnknownDestinationAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isTransferError = (o: any): o is TransferError =>
  Object.values(TransferError).includes(o)

export function isAllAccountExistsErrors(
  errors: CreateAccountErrorCode[]
): boolean {
  return isAllAccountErrors(errors, [
    CreateAccountErrorCode.exists_with_different_flags,
    CreateAccountErrorCode.exists_with_different_user_data,
    CreateAccountErrorCode.exists_with_different_ledger,
    CreateAccountErrorCode.exists_with_different_code,
    CreateAccountErrorCode.exists_with_different_debits_pending,
    CreateAccountErrorCode.exists_with_different_debits_posted,
    CreateAccountErrorCode.exists_with_different_credits_pending,
    CreateAccountErrorCode.exists_with_different_credits_posted,
    CreateAccountErrorCode.exists
  ])
}

export function isAllAccountErrors(
  errors: CreateAccountErrorCode[],
  errToVerify: CreateAccountErrorCode[]
): boolean {
  for (const verify of errToVerify) {
    if (errors.includes(verify)) continue
    return false
  }
  return true
}

export class BalanceTransferError extends Error {
  constructor(public error: TransferError) {
    super()
    this.name = 'TransferError'
  }
}

export class UnknownAccountError extends Error {
  constructor(accountId: AccountId) {
    super('Account not found. account=' + accountId)
    this.name = 'UnknownAccountError'
  }
}
