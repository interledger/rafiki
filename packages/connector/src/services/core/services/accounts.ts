// TODO move all this to types/accounts?

export interface AccountsService {
  getAccount(accountId: string): Promise<IlpAccount>
  getAccountByDestinationAddress(
    destinationAddress: string
  ): Promise<IlpAccount>
  getAccountByToken(token: string): Promise<IlpAccount | null>
  getAccountBalance(accountId: string): Promise<IlpBalance>
  createAccount(account: IlpAccount): Promise<IlpAccount>
  //transferFunds(args: TransferOptions): Promise<Transfer>
  adjustBalances(options: AdjustmentOptions): Promise<void>
}

export interface AdjustmentOptions {
  sourceAmount: bigint
  sourceAccountId: string
  destinationAccountId: string
  callback: (trx: Transaction) => Promise<void>
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
    incoming: {
      authTokens: string[]
      endpoint: string
    }
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

export interface IlpBalance {
  //id: string
  balance: bigint
  //children?: IlpBalanceChildren
  //parent: IlpBalanceParent
}
