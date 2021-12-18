import {
  CommitTransferError as CommitTransferErrorCode,
  CreateTransferError as CreateTransferErrorCode
} from 'tigerbeetle-node'

import { AccountIdOptions } from './utils'

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

export class CommitTransferError extends Error {
  constructor(public code: CommitTransferErrorCode) {
    super()
    this.name = 'CommitTransferError'
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

export class BalanceTransferError extends Error {
  constructor(public error: TransferError) {
    super()
    this.name = 'TransferError'
  }
}

export class UnknownAccountError extends Error {
  constructor(account: AccountIdOptions) {
    super('Account not found. account=' + JSON.stringify(account))
    this.name = 'UnknownAccountError'
  }
}
