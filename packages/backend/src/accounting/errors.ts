import {
  CreateAccountError as CreateAccountErrorCode,
  CreateTransferError as CreateTransferErrorCode
} from 'tigerbeetle-node'
import { AccountId } from './utils'

export class CreateAccountError extends Error {
  constructor(public code: number) {
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

export function areAllAccountExistsErrors(
  errors: CreateAccountErrorCode[]
): boolean {
  return areAllOfTypeAccountErrors(errors, [
    CreateAccountErrorCode.exists_with_different_debits_pending,
    CreateAccountErrorCode.exists_with_different_debits_posted,
    CreateAccountErrorCode.exists_with_different_credits_pending,
    CreateAccountErrorCode.exists_with_different_credits_posted,
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
