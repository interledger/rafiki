// TODO move all this to types/accounts?

export interface AccountsService {
  getAccount(accountId: string): Promise<IlpAccount | undefined>
  getAccountByDestinationAddress(
    destinationAddress: string
  ): Promise<IlpAccount | undefined>
  getAccountByToken(token: string): Promise<IlpAccount | undefined>
  getAccountBalance(accountId: string): Promise<IlpBalance | undefined>
  createAccount(
    account: CreateOptions
  ): Promise<IlpAccount | CreateAccountError>
  transferFunds(args: Transfer): Promise<Transaction | TransferError>
  getAddress(accountId: string): Promise<string | undefined>
}

export type Transfer = {
  sourceAccountId: string
  destinationAccountId: string

  sourceAmount: bigint
  destinationAmount?: bigint
}

export interface Transaction {
  commit: () => Promise<void | TransferError>
  rollback: () => Promise<void | TransferError>
}

export interface IlpAccount {
  accountId: string
  parentAccountId?: string
  disabled: boolean // you can fetch config of disabled account but it will not process packets

  asset: {
    code: string
    scale: number
  }
  http?: {
    outgoing: {
      authToken: string
      endpoint: string
    }
  }
  stream?: {
    enabled: boolean
  }
  routing?: {
    staticIlpAddress: string // ILP address for this account
  }

  maxPacketAmount?: bigint
}

export type CreateOptions = Omit<IlpAccount, 'disabled'> & {
  disabled?: boolean
  http?: {
    incoming?: {
      authTokens: string[]
    }
  }
}

// interface IlpBalanceChildren {
//   availableCredit: bigint
//   totalLent: bigint
// }

// interface IlpBalanceParent {
//   availableCreditLine: bigint
//   totalBorrowed: bigint
// }

export interface IlpBalance {
  id: string
  balance: bigint
  // children?: IlpBalanceChildren
  // parent?: IlpBalanceParent
}

export enum CreateAccountError {
  DuplicateAccountId = 'DuplicateAccountId',
  DuplicateIncomingToken = 'DuplicateIncomingToken'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isCreateAccountError = (o: any): o is CreateAccountError =>
  Object.values(CreateAccountError).includes(o)

export enum TransferError {
  InsufficientBalance = 'InsufficientBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InvalidSourceAmount = 'InvalidSourceAmount',
  InvalidDestinationAmount = 'InvalidDestinationAmount',
  SameAccounts = 'SameAccounts',
  TransferAlreadyCommitted = 'TransferAlreadyCommitted',
  TransferAlreadyRejected = 'TransferAlreadyRejected',
  TransferExpired = 'TransferExpired',
  UnknownSourceAccount = 'UnknownSourceAccount',
  UnknownDestinationAccount = 'UnknownDestinationAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isTransferError = (o: any): o is TransferError =>
  Object.values(TransferError).includes(o)
