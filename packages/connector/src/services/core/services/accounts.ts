// TODO move all this to types/accounts?

export interface AccountsService {
  getAccount(accountId: string): Promise<IlpAccount | null>
  getAccountByDestinationAddress(
    destinationAddress: string
  ): Promise<IlpAccount | null>
  getAccountByToken(token: string): Promise<IlpAccount | null>
  getAccountBalance(accountId: string): Promise<IlpBalance | null>
  createAccount(account: CreateOptions): Promise<IlpAccount>
  transferFunds(args: Transfer): Promise<Transaction | AccountError>
  getAddress(accountId: string): Promise<string | null>
}

export type Transfer = {
  sourceAccountId: string
  destinationAccountId: string

  sourceAmount: bigint
  destinationAmount?: bigint
}

export interface Transaction {
  commit: () => Promise<void>
  rollback: () => Promise<void>
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

export enum AccountError {
  InsufficientBalance = 'InsufficientBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InsufficientSettlementBalance = 'InsufficientSettlementBalance',
  InvalidDestinationAmount = 'InvalidDestinationAmount',
  UnknownAccount = 'UnknownAccount',
  UnknownSourceAccount = 'UnknownSourceAccount',
  UnknownDestinationAccount = 'UnknownDestinationAccount',
  UnknownLiquidityAccount = 'UnknownLiquidityAccount',
  UnknownSettlementAccount = 'UnknownSettlementAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAccountError = (o: any): o is AccountError =>
  Object.values(AccountError).includes(o)
