import { Asset } from './asset'
import { AccountDeposit, LiquidityDeposit, DepositError } from './deposit'
import { IlpAccount } from './ilpAccount'
import { IlpBalance } from './ilpBalance'
import {
  CreditOptions,
  ExtendCreditOptions,
  SettleDebtOptions,
  CreditError
} from './credit'
import { Transfer, Transaction, TransferError } from './transfer'
import {
  AccountWithdrawal,
  LiquidityWithdrawal,
  WithdrawError
} from './withdrawal'

export interface ConnectorAccountsService {
  getAccount(accountId: string): Promise<IlpAccount | undefined>
  getAccountByDestinationAddress(
    destinationAddress: string
  ): Promise<IlpAccount | undefined>
  getAccountByToken(token: string): Promise<IlpAccount | undefined>
  transferFunds(args: Transfer): Promise<Transaction | TransferError>
  getAddress(accountId: string): Promise<string | undefined>
}

export interface AccountsService extends ConnectorAccountsService {
  createAccount(
    account: CreateOptions
  ): Promise<IlpAccount | CreateAccountError>
  updateAccount(
    accountOptions: UpdateOptions
  ): Promise<IlpAccount | UpdateAccountError>
  getSubAccounts(accountId: string): Promise<IlpAccount[]>
  getAccountBalance(accountId: string): Promise<IlpBalance | undefined>
  depositLiquidity(deposit: LiquidityDeposit): Promise<void | DepositError>
  withdrawLiquidity(
    withdrawal: LiquidityWithdrawal
  ): Promise<void | WithdrawError>
  getLiquidityBalance(
    assetCode: string,
    assetScale: number
  ): Promise<bigint | undefined>
  getSettlementBalance(
    assetCode: string,
    assetScale: number
  ): Promise<bigint | undefined>
  deposit(deposit: AccountDeposit): Promise<void | DepositError>
  withdraw(withdrawal: AccountWithdrawal): Promise<void | WithdrawError>
  extendCredit(extendOptions: ExtendCreditOptions): Promise<void | CreditError>
  utilizeCredit(utilizeOptions: CreditOptions): Promise<void | CreditError>
  revokeCredit(revokeOptions: CreditOptions): Promise<void | CreditError>
  settleDebt(settleOptions: SettleDebtOptions): Promise<void | CreditError>
}

export type UpdateOptions = Omit<
  IlpAccount,
  'disabled' | 'asset' | 'superAccountId'
> & {
  disabled?: boolean
  http?: {
    incoming?: {
      authTokens: string[]
    }
  }
}

export type CreateAccountOptions = UpdateOptions & {
  asset: Asset
  superAccountId?: never
}

export type CreateSubAccountOptions = UpdateOptions & {
  asset?: never
  superAccountId: string
}

export type CreateOptions = CreateAccountOptions | CreateSubAccountOptions

export function isSubAccount(
  account: CreateOptions
): account is CreateSubAccountOptions {
  return (account as CreateSubAccountOptions).superAccountId !== undefined
}

export enum CreateAccountError {
  DuplicateAccountId = 'DuplicateAccountId',
  DuplicateIncomingToken = 'DuplicateIncomingToken',
  UnknownSuperAccount = 'UnknownSuperAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isCreateAccountError = (o: any): o is CreateAccountError =>
  Object.values(CreateAccountError).includes(o)

export enum UpdateAccountError {
  DuplicateIncomingToken = 'DuplicateIncomingToken',
  UnknownAccount = 'UnknownAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isUpdateAccountError = (o: any): o is UpdateAccountError =>
  Object.values(UpdateAccountError).includes(o)
