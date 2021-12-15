import {
  AccountFlags,
  Client,
  CreateAccountError as CreateAccountErrorCode
} from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import {
  AccountType as Type,
  calculateBalance,
  createAccounts,
  getAccounts
} from './accounts'
import {
  BalanceTransferError,
  CreateAccountError,
  TransferError,
  UnknownAccountError
} from './errors'
import {
  createTransfers,
  commitTransfers,
  rollbackTransfers
} from './transfers'
import { AccountIdOptions } from './utils'
import { BaseService } from '../shared/baseService'
import { validateId } from '../shared/utils'

export enum AccountType {
  Liquidity = 1,
  Send,
  Receive
}

export const RATE_PROBE_ACCOUNT_ID = AccountType.Liquidity.toString()

export const SEND_ACCOUNT_ID = AccountType.Send.toString()

export const RECEIVE_ACCOUNT_ID = AccountType.Receive.toString()

export interface LiquidityAccount {
  id: string
  asset: {
    unit: number
  }
  balance: bigint
  type: AccountType.Liquidity
}

export interface SendAccount {
  id: string
  asset?: never
  totalSent: bigint
  type: AccountType.Send
}

export interface ReceiveAccount {
  id: string
  asset?: never
  totalReceived: bigint
  receiveLimit?: bigint
  type: AccountType.Receive
}

export type Account = LiquidityAccount | SendAccount | ReceiveAccount

export type CreateOptions =
  | Omit<LiquidityAccount, 'balance'>
  | Omit<SendAccount, 'totalSent'>
  | Omit<ReceiveAccount, 'totalReceived'>

export enum AssetAccount {
  Liquidity = 1,
  Settlement
}

export interface AccountOptions {
  id: string
  asset: {
    unit: number
  }
  type: AccountType
}

export interface SendReceiveOptions {
  sourceAccount: AccountOptions
  destinationAccount: AccountOptions
  sourceAmount: bigint
  destinationAmount?: bigint
  timeout: bigint // nano-seconds
}

type Options = {
  id?: string
  sourceAccount: AccountIdOptions
  destinationAccount: AccountIdOptions
  amount: bigint
}

export type AutoCommitTransfer = Options & {
  timeout?: never
}

export type TwoPhaseTransfer = Required<Options> & {
  timeout?: bigint // nano-seconds
}

export type Transfer = AutoCommitTransfer | TwoPhaseTransfer

export interface Transaction {
  commit: () => Promise<void | TransferError>
  rollback: () => Promise<void | TransferError>
}

export interface AccountingService {
  boot(): Promise<void>
  createAccount(options: CreateOptions): Promise<Account>
  createAssetAccounts(unit: number): Promise<void>
  getAccount(id: string): Promise<Account | undefined>
  getBalance(id: string): Promise<bigint | undefined>
  getTotalSent(id: string): Promise<bigint | undefined>
  getTotalReceived(id: string): Promise<bigint | undefined>
  getAssetAccountBalance(
    unit: number,
    account: AssetAccount
  ): Promise<bigint | undefined>
  sendAndReceive(
    options: SendReceiveOptions
  ): Promise<Transaction | TransferError>
  createTransfer(transfer: Transfer): Promise<void | TransferError>
  commitTransfer(id: string): Promise<void | TransferError>
  rollbackTransfer(id: string): Promise<void | TransferError>
}

export interface ServiceDependencies extends BaseService {
  tigerbeetle: Client
}

export function createAccountingService({
  logger,
  knex,
  tigerbeetle
}: ServiceDependencies): AccountingService {
  const log = logger.child({
    service: 'AccountingService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex: knex,
    tigerbeetle
  }
  return {
    boot: () => boot(deps),
    createAccount: (options) => createAccount(deps, options),
    createAssetAccounts: (unit) => createAssetAccounts(deps, unit),
    getAccount: (id) => getAccount(deps, id),
    getBalance: (id) => getAccountBalance(deps, id),
    getTotalSent: (id) => getAccountTotalSent(deps, id),
    getTotalReceived: (id) => getAccountTotalReceived(deps, id),
    getAssetAccountBalance: (unit, account) =>
      getAssetAccountBalance(deps, unit, account),
    sendAndReceive: (options) => sendAndReceive(deps, options),
    createTransfer: (transfer) => createTransfer(deps, transfer),
    commitTransfer: (options) => commitTransfer(deps, options),
    rollbackTransfer: (options) => rollbackTransfer(deps, options)
  }
}

export async function boot(deps: ServiceDependencies): Promise<void> {
  const accounts = [
    {
      id: RATE_PROBE_ACCOUNT_ID,
      type: Type.Debit,
      unit: AccountType.Send
    },
    {
      id: SEND_ACCOUNT_ID,
      type: Type.Credit,
      unit: AccountType.Send
    },
    {
      id: RECEIVE_ACCOUNT_ID,
      type: Type.Debit,
      unit: AccountType.Receive
    }
  ]

  try {
    await createAccounts(deps, accounts)
  } catch (err) {
    // Don't complain if accounts already exist.
    if (
      err instanceof CreateAccountError &&
      err.code === CreateAccountErrorCode.exists
    ) {
      return
    }
    throw err
  }
}

export async function createAccount(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<Account> {
  if (!validateId(options.id)) {
    throw new Error('unable to create account, invalid id')
  }

  switch (options.type) {
    case AccountType.Liquidity:
      await createAccounts(deps, [
        {
          id: options.id,
          type: Type.Credit,
          unit: options.asset.unit
        }
      ])
      return {
        ...options,
        balance: BigInt(0)
      }
    case AccountType.Send:
      await createAccounts(deps, [
        {
          id: options.id,
          type: Type.Debit,
          unit: AccountType.Send
        }
      ])
      return {
        ...options,
        totalSent: BigInt(0)
      }
    case AccountType.Receive:
      // Receive accounts are initially debited by the receiveLimit, if present.
      // Credits are restricted such that the invoice cannot receive more than that amount.
      // The account balance represents the remaining receive limit.
      await createAccounts(deps, [
        {
          id: options.id,
          type: options.receiveLimit ? Type.Debit : Type.Credit,
          unit: AccountType.Receive,
          debits: options.receiveLimit
        }
      ])
      return {
        ...options,
        totalReceived: BigInt(0)
      }
    default:
      throw new Error('unknown account type')
  }
}

export async function createAssetAccounts(
  deps: ServiceDependencies,
  unit: number
): Promise<void> {
  const accounts = [
    {
      asset: {
        unit,
        account: AssetAccount.Liquidity
      },
      type: Type.Credit,
      unit
    },
    {
      asset: {
        unit,
        account: AssetAccount.Settlement
      },
      type: Type.Debit,
      unit
    }
  ]

  try {
    await createAccounts(deps, accounts)
  } catch (err) {
    // Don't complain if asset accounts already exist.
    // This could change if TigerBeetle could be reset between tests.
    if (
      err instanceof CreateAccountError &&
      err.code === CreateAccountErrorCode.exists
    ) {
      return
    }
    throw err
  }
}

export async function getAccount(
  deps: ServiceDependencies,
  id: string
): Promise<Account | undefined> {
  const accounts = await getAccounts(deps, [
    {
      id
    }
  ])

  if (accounts.length) {
    const account = accounts[0]

    switch (account.unit) {
      case AccountType.Send:
        return {
          id,
          type: AccountType.Send,
          totalSent: account.debits_accepted
        }
      case AccountType.Receive:
        return {
          id,
          type: AccountType.Receive,
          totalReceived: account.credits_accepted,
          receiveLimit:
            account.flags & AccountFlags.credits_must_not_exceed_debits
              ? calculateBalance(account)
              : undefined
        }
      default:
        return {
          id,
          asset: {
            unit: account.unit
          },
          type: AccountType.Liquidity,
          balance: calculateBalance(account)
        }
    }
  }
}

export async function getAccountBalance(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (await getAccounts(deps, [{ id }]))[0]

  if (
    account &&
    account.unit !== AccountType.Send &&
    account.unit !== AccountType.Receive
  ) {
    return calculateBalance(account)
  }
}

export async function getAccountTotalSent(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (await getAccounts(deps, [{ id }]))[0]
  if (account?.unit === AccountType.Send) {
    return account.debits_accepted
  }
}

export async function getAccountTotalReceived(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (await getAccounts(deps, [{ id }]))[0]
  if (account?.unit === AccountType.Receive) {
    return account.credits_accepted
  }
}

export async function getAssetAccountBalance(
  deps: ServiceDependencies,
  unit: number,
  account: AssetAccount
): Promise<bigint | undefined> {
  const assetAccount = (
    await getAccounts(deps, [{ asset: { unit, account } }])
  )[0]

  if (assetAccount) {
    return calculateBalance(assetAccount)
  }
}

export async function sendAndReceive(
  deps: ServiceDependencies,
  {
    sourceAccount,
    destinationAccount,
    sourceAmount,
    destinationAmount,
    timeout
  }: SendReceiveOptions
): Promise<Transaction | TransferError> {
  if (
    sourceAccount.id &&
    destinationAccount.id &&
    sourceAccount.id === destinationAccount.id
  ) {
    return TransferError.SameAccounts
  }
  if (sourceAmount <= BigInt(0)) {
    return TransferError.InvalidSourceAmount
  }
  if (destinationAmount !== undefined && destinationAmount <= BigInt(0)) {
    return TransferError.InvalidDestinationAmount
  }

  // Sending: send source account (from asset's settlement account)
  // Receiving: receive destination account (to asset's settlement account)
  // Intra-rafiki transfer: send source account && receive destination account
  // Otherwise, forwarding between peers
  const sourceLiquidity =
    sourceAccount.type === AccountType.Send
      ? {
          asset: {
            unit: sourceAccount.asset.unit,
            account: AssetAccount.Settlement
          }
        }
      : sourceAccount

  const destinationLiquidity =
    destinationAccount.type === AccountType.Receive
      ? {
          asset: {
            unit: destinationAccount.asset.unit,
            account: AssetAccount.Settlement
          }
        }
      : destinationAccount
  const transfers: TwoPhaseTransfer[] = []

  // Same asset
  if (sourceAccount.asset.unit === destinationAccount.asset.unit) {
    // Don't send from settlement account to itself
    if (
      sourceAccount.type !== AccountType.Send ||
      destinationAccount.type !== AccountType.Receive
    ) {
      transfers.push({
        id: uuid(),
        sourceAccount: sourceLiquidity,
        destinationAccount: destinationLiquidity,
        amount:
          destinationAmount && destinationAmount < sourceAmount
            ? destinationAmount
            : sourceAmount,
        timeout
      })
    }
    // Same asset, different amounts
    if (destinationAmount && sourceAmount !== destinationAmount) {
      // Send excess source amount to liquidity account
      if (destinationAmount < sourceAmount) {
        transfers.push({
          id: uuid(),
          sourceAccount: sourceLiquidity,
          destinationAccount: {
            asset: {
              unit: sourceAccount.asset.unit,
              account: AssetAccount.Liquidity
            }
          },
          amount: sourceAmount - destinationAmount,
          timeout
        })
        // Deliver excess destination amount from liquidity account
      } else {
        transfers.push({
          id: uuid(),
          sourceAccount: {
            asset: {
              unit: destinationAccount.asset.unit,
              account: AssetAccount.Liquidity
            }
          },
          destinationAccount: destinationLiquidity,
          amount: destinationAmount - sourceAmount,
          timeout
        })
      }
    }
    // Different assets
  } else {
    // must specify destination amount
    if (!destinationAmount) {
      return TransferError.InvalidDestinationAmount
    }
    // Send to source liquidity account
    // Deliver from destination liquidity account
    transfers.push(
      {
        id: uuid(),
        sourceAccount: sourceLiquidity,
        destinationAccount: {
          asset: {
            unit: sourceAccount.asset.unit,
            account: AssetAccount.Liquidity
          }
        },
        amount: sourceAmount,
        timeout
      },
      {
        id: uuid(),
        sourceAccount: {
          asset: {
            unit: destinationAccount.asset.unit,
            account: AssetAccount.Liquidity
          }
        },
        destinationAccount: destinationLiquidity,
        amount: destinationAmount,
        timeout
      }
    )
  }
  if (sourceAccount.type === AccountType.Send) {
    transfers.push({
      id: uuid(),
      sourceAccount,
      destinationAccount: {
        id: SEND_ACCOUNT_ID
      },
      amount: sourceAmount,
      timeout
    })
  }
  if (destinationAccount.type === AccountType.Receive) {
    transfers.push({
      id: uuid(),
      sourceAccount: {
        id: RECEIVE_ACCOUNT_ID
      },
      destinationAccount,
      amount: destinationAmount || sourceAmount,
      timeout
    })
  }
  const error = await createTransfers(deps, transfers)
  if (error) {
    switch (error.error) {
      case TransferError.UnknownSourceAccount:
        throw new UnknownAccountError(transfers[error.index].sourceAccount)
      case TransferError.UnknownDestinationAccount:
        throw new UnknownAccountError(transfers[error.index].destinationAccount)
      case TransferError.InsufficientBalance:
        if (
          transfers[error.index].sourceAccount.asset?.account ===
          AssetAccount.Liquidity
        ) {
          return TransferError.InsufficientLiquidity
        }
        return TransferError.InsufficientBalance
      case TransferError.InsufficientDebitBalance:
        if (
          destinationAccount.type === AccountType.Receive &&
          transfers[error.index].destinationAccount.id === destinationAccount.id
        ) {
          return TransferError.ReceiveLimitExceeded
        }
        throw new BalanceTransferError(error.error)
      default:
        throw new BalanceTransferError(error.error)
    }
  }

  const trx: Transaction = {
    commit: async (): Promise<void | TransferError> => {
      const error = await commitTransfers(
        deps,
        transfers.map((transfer) => transfer.id)
      )
      if (error) {
        return error.error
      }
    },
    rollback: async (): Promise<void | TransferError> => {
      const error = await rollbackTransfers(
        deps,
        transfers.map((transfer) => transfer.id)
      )
      if (error) {
        return error.error
      }
    }
  }
  return trx
}

async function createTransfer(
  deps: ServiceDependencies,
  transfer: Transfer
): Promise<void | TransferError> {
  if (transfer.id && !validateId(transfer.id)) {
    return TransferError.InvalidId
  }
  const error = await createTransfers(deps, [transfer])
  if (error) {
    return error.error
  }
}

async function rollbackTransfer(
  deps: ServiceDependencies,
  transferId: string
): Promise<void | TransferError> {
  if (!validateId(transferId)) {
    return TransferError.InvalidId
  }
  const error = await rollbackTransfers(deps, [transferId])
  if (error) {
    return error.error
  }
}

async function commitTransfer(
  deps: ServiceDependencies,
  transferId: string
): Promise<void | TransferError> {
  if (!validateId(transferId)) {
    return TransferError.InvalidId
  }
  const error = await commitTransfers(deps, [transferId])
  if (error) {
    return error.error
  }
}
