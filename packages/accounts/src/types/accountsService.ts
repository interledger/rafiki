import { AccountDeposit, LiquidityDeposit, DepositError } from './deposit'
import { IlpAccount } from './ilpAccount'
import { IlpBalance } from './ilpBalance'
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
}

export type CreateOptions = Omit<IlpAccount, 'disabled' | 'subAccountIds'> & {
  disabled?: boolean
  http?: {
    incoming?: {
      authTokens: string[]
    }
  }
}

export enum CreateAccountError {
  DuplicateAccountId = 'DuplicateAccountId',
  DuplicateIncomingToken = 'DuplicateIncomingToken',
  InvalidAsset = 'InvalidAsset',
  UnknownSuperAccount = 'UnknownSuperAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isCreateAccountError = (o: any): o is CreateAccountError =>
  Object.values(CreateAccountError).includes(o)

export type UpdateOptions = Omit<
  CreateOptions,
  'asset' | 'superAccountId' | 'subAccountIds'
>

export enum UpdateAccountError {
  DuplicateIncomingToken = 'DuplicateIncomingToken',
  UnknownAccount = 'UnknownAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isUpdateAccountError = (o: any): o is UpdateAccountError =>
  Object.values(UpdateAccountError).includes(o)
