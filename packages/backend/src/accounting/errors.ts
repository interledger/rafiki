import { GraphQLErrorCode } from '../graphql/errors'

export class CreateAccountError extends Error {
  constructor(public code: number) {
    super('CreateAccountError code=' + code)
    this.name = 'CreateAccountError'
  }
}

export class AccountAlreadyExistsError extends Error {
  constructor(public message: string) {
    super(`AccountAlreadyExistsError ${message}`)
    this.name = 'AccountAlreadyExistsError'
  }
}

export enum TransferError {
  AlreadyPosted = 'AlreadyPosted',
  AlreadyVoided = 'AlreadyVoided',
  DifferentAssets = 'DifferentAssets',
  InsufficientBalance = 'InsufficientBalance',
  InsufficientDebitBalance = 'InsufficientDebitBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InvalidAmount = 'InvalidAmount',
  InvalidId = 'InvalidId',
  InvalidSourceAmount = 'InvalidSourceAmount',
  InvalidDestinationAmount = 'InvalidDestinationAmount',
  InvalidTimeout = 'InvalidTimeout',
  SameAccounts = 'SameAccounts',
  TransferExists = 'TransferExists',
  TransferExpired = 'TransferExpired',
  UnknownTransfer = 'UnknownTransfer',
  UnknownError = 'UnknownError',
  UnknownSourceAccount = 'UnknownSourceAccount',
  UnknownDestinationAccount = 'UnknownDestinationAccount'
}

export const errorToCode: {
  [key in TransferError]: GraphQLErrorCode
} = {
  [TransferError.AlreadyPosted]: GraphQLErrorCode.Conflict,
  [TransferError.AlreadyVoided]: GraphQLErrorCode.Conflict,
  [TransferError.DifferentAssets]: GraphQLErrorCode.Forbidden,
  [TransferError.InsufficientBalance]: GraphQLErrorCode.Forbidden,
  [TransferError.InsufficientDebitBalance]: GraphQLErrorCode.Forbidden,
  [TransferError.InsufficientLiquidity]: GraphQLErrorCode.Forbidden,
  [TransferError.InvalidAmount]: GraphQLErrorCode.BadUserInput,
  [TransferError.InvalidId]: GraphQLErrorCode.BadUserInput,
  [TransferError.InvalidSourceAmount]: GraphQLErrorCode.BadUserInput,
  [TransferError.InvalidDestinationAmount]: GraphQLErrorCode.BadUserInput,
  [TransferError.InvalidTimeout]: GraphQLErrorCode.BadUserInput,
  [TransferError.SameAccounts]: GraphQLErrorCode.Forbidden,
  [TransferError.TransferExists]: GraphQLErrorCode.Duplicate,
  [TransferError.TransferExpired]: GraphQLErrorCode.Forbidden,
  [TransferError.UnknownTransfer]: GraphQLErrorCode.NotFound,
  [TransferError.UnknownError]: GraphQLErrorCode.InternalServerError,
  [TransferError.UnknownSourceAccount]: GraphQLErrorCode.NotFound,
  [TransferError.UnknownDestinationAccount]: GraphQLErrorCode.NotFound
}

export const errorToMessage: {
  [key in TransferError]: string
} = {
  [TransferError.AlreadyPosted]: 'Transfer already posted',
  [TransferError.AlreadyVoided]: 'Transfer already voided',
  [TransferError.DifferentAssets]: 'Transfer accounts have different assets',
  [TransferError.InsufficientBalance]: 'Insufficient transfer balance',
  [TransferError.InsufficientDebitBalance]:
    'Insufficient transfer debit balance',
  [TransferError.InsufficientLiquidity]:
    'Insufficient transfer liquidity available',
  [TransferError.InvalidAmount]: 'Invalid transfer amount',
  [TransferError.InvalidId]: 'Invalid transfer id',
  [TransferError.InvalidSourceAmount]: 'Invalid source account amount',
  [TransferError.InvalidDestinationAmount]:
    'Invalid destination account amount',
  [TransferError.InvalidTimeout]: 'Invalid transfer timeout provided',
  [TransferError.SameAccounts]: 'Transfer is between the same accounts',
  [TransferError.TransferExists]: 'Transfer already exists',
  [TransferError.TransferExpired]: 'Transfer already expired',
  [TransferError.UnknownTransfer]: 'Unknown transfer',
  [TransferError.UnknownError]: 'Internal server error',
  [TransferError.UnknownSourceAccount]: 'Unknown source account',
  [TransferError.UnknownDestinationAccount]: 'Unknown destination account'
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
