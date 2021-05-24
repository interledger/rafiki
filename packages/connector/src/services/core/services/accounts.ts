//import { AccountInfo } from '../../types'
// TODO move all this to types/accounts?

/*
export interface Transfer {
  transferId: string
  sourceAccountId: string
  destinationAccountId: string
  sourceAmount: bigint
  destinationAmount: bigint
}

export type TransferBySourceAmount = Omit<Transfer, "transferId" | "destinationAmount">
export type TransferByDestinationAmount = Omit<Transfer, "transferId" | "sourceAmount">
export type TransferOptions = TransferBySourceAmount | TransferByDestinationAmount
*/

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

  asset: IlpAsset
  http?: {
    incoming: IlpAccountHttpIncoming
    outgoing: IlpAccountHttpOutgoing
  }
  stream?: IlpAccountStream
  routing?: IlpAccountRouting

  maxPacketAmount?: bigint
  rateLimitRefillPeriod?: number // TODO?
  rateLimitRefillCount?: bigint // TODO?
  rateLimitCapacity?: bigint // TODO?
  minExpirationWindow?: number // TODO?
  maxHoldWindow?: number // TODO?
  incomingThroughputLimitRefillPeriod?: number // TODO?
  incomingThroughputLimit?: bigint // TODO?
  outgoingThroughputLimitRefillPeriod?: number // TODO?
  outgoingThroughputLimit?: bigint // TODO?
}

export interface IlpBalance {
  //id: string
  balance: bigint
  //children?: IlpBalanceChildren
  //parent: IlpBalanceParent
}

export interface IlpAsset {
  code: string
  scale: number
}

export interface IlpAccountHttpIncoming {
  authTokens: string[]
  endpoint: string
}

export interface IlpAccountHttpOutgoing {
  authToken: string
  endpoint: string
}

export interface IlpAccountStream {
  enabled: boolean
}

export interface IlpAccountRouting {
  staticIlpAddress: string // ILP address for this account
}

// TODO: this may not be the best structure
//interface RoutingTable {
//  [prefix: string]: accountId
//}
