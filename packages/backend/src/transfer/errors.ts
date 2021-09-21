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

export class RollbackTransferError extends Error {
  constructor(public code: CommitTransferErrorCode) {
    super()
    this.name = 'RollbackTransferError'
  }
}
