import {
  CommitTransferError as CommitTransferErrorCode,
  CreateTransferError as CreateTransferErrorCode
} from 'tigerbeetle-node'

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
  InvalidAmount = 'InvalidAmount',
  SameBalances = 'SameBalances',
  TransferExists = 'TransferExists',
  TransferExpired = 'TransferExpired',
  UnknownTransfer = 'UnknownTransfer',
  UnknownSourceBalance = 'UnknownSourceBalance',
  UnknownDestinationBalance = 'UnknownDestinationBalance'
}

export type TransfersError = {
  index: number
  error: TransferError
}
