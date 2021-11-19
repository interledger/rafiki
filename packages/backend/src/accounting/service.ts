import assert from 'assert'
import {
  AccountFlags,
  Client,
  CreateAccountError as CreateAccountErrorCode
} from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import {
  calculateBalance,
  CreateAccountOptions,
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
  CreateTransferOptions,
  createTransfers,
  commitTransfers,
  rollbackTransfers
} from './transfers'
import { BaseService } from '../shared/baseService'
import { validateId } from '../shared/utils'

// Credit and debit accounts can both send and receive
// but are restricted by their respective Tigerbeetle flags.
// In Rafiki transfers:
// - the sourceAccount account's debits increase
// - the destinationAccount account's credits increase
export enum AccountType {
  Credit = 'Credit', // debits_must_not_exceed_credits
  Debit = 'Debit' // credits_must_not_exceed_debits
}

export interface Account {
  id: string
  balance: bigint
  asset: {
    unit: number
  }
  type: AccountType
  totalSent?: bigint
  receiveLimit?: bigint
}

export interface CreateOptions {
  id?: string
  asset: {
    unit: number
  }
  type: AccountType
  sentBalance?: boolean
  receiveLimit?: bigint
}

export enum Balance {
  TotalSent = 1,
  ReceiveLimit
}

export enum AssetAccount {
  Liquidity = 1,
  Settlement,
  Sent,
  ReceiveLimit
}

interface BasicAccountOptions {
  id: string
  asset: {
    unit: number
    account?: never
  }
  withBalance?: Balance
}

interface AssetAccountOptions {
  id?: never
  asset: {
    unit: number
    account: AssetAccount
  }
  withBalance?: never
}

export type AccountOptions = BasicAccountOptions | AssetAccountOptions

type Options = {
  id?: string
  sourceAccount: AccountOptions
  destinationAccount: AccountOptions
  amount: bigint
}

export type AutoCommitTransfer = Options & {
  timeout?: never
}

export type TwoPhaseTransfer = Required<Options> & {
  timeout?: bigint // nano-seconds
}

export type Transfer = AutoCommitTransfer | TwoPhaseTransfer

export interface AccountTransferOptions {
  sourceAccount: AccountOptions
  destinationAccount: AccountOptions
  sourceAmount: bigint
  destinationAmount?: bigint
  timeout: bigint // nano-seconds
}

export interface AccountTransfer {
  commit: () => Promise<void | TransferError>
  rollback: () => Promise<void | TransferError>
}

export interface AccountingService {
  createAccount(options: CreateOptions): Promise<Account>
  createAssetAccounts(unit: number): Promise<void>
  getAccount(id: string): Promise<Account | undefined>
  getBalance(id: string): Promise<bigint | undefined>
  getTotalSent(accountId: string): Promise<bigint | undefined>
  getReceiveLimit(accountId: string): Promise<bigint | undefined>
  getAssetAccountBalance(
    unit: number,
    account: AssetAccount
  ): Promise<bigint | undefined>
  transferFunds(
    options: AccountTransferOptions
  ): Promise<AccountTransfer | TransferError>
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
    createAccount: (options) => createAccount(deps, options),
    createAssetAccounts: (unit) => createAssetAccounts(deps, unit),
    getAccount: (id) => getAccount(deps, id),
    getBalance: (id) => getAccountBalance(deps, id),
    getTotalSent: (id) => getTotalSent(deps, id),
    getReceiveLimit: (id) => getReceiveLimit(deps, id),
    getAssetAccountBalance: (unit, account) =>
      getAssetAccountBalance(deps, unit, account),
    transferFunds: (options) => transferFunds(deps, options),
    createTransfer: (transfer) => createTransfer(deps, transfer),
    commitTransfer: (options) => commitTransfer(deps, options),
    rollbackTransfer: (options) => rollbackTransfer(deps, options)
  }
}

export async function createAccount(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<Account> {
  if (options.id && !validateId(options.id)) {
    throw new Error('unable to create account, invalid id')
  }

  const id = options.id || uuid()

  const accounts: CreateAccountOptions[] = [
    {
      id,
      asset: options.asset,
      type: options.type
    }
  ]

  if (options.sentBalance) {
    accounts.push({
      id,
      asBalance: Balance.TotalSent,
      asset: options.asset,
      type: AccountType.Credit
    })
  }

  if (options.receiveLimit) {
    accounts.push({
      id,
      asBalance: Balance.ReceiveLimit,
      asset: options.asset,
      type: AccountType.Debit
    })
  }

  await createAccounts(deps, accounts)

  let receiveLimit: bigint | undefined
  if (options.receiveLimit) {
    // Allow a little extra, to be more forgiving about (favorable) exchange rate fluctuations.
    receiveLimit = options.receiveLimit + BigInt(1)
    const transferError = await createTransfers(deps, [
      {
        id: uuid(),
        sourceAccount: {
          id,
          asBalance: Balance.ReceiveLimit,
          asset: {
            unit: options.asset.unit
          }
        },
        destinationAccount: {
          asset: {
            unit: options.asset.unit,
            account: AssetAccount.ReceiveLimit
          }
        },
        amount: receiveLimit
      }
    ])
    if (transferError) {
      deps.logger.error(
        { transferError },
        'receive limit setup TigerBeetle error'
      )
      throw new Error(
        'unable to create receive limit balance, TigerBeetle error'
      )
    }
  }

  return {
    id,
    asset: options.asset,
    type: options.type,
    balance: BigInt(0),
    totalSent: options.sentBalance ? BigInt(0) : undefined,
    receiveLimit
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
      type: AccountType.Credit
    },
    {
      asset: {
        unit,
        account: AssetAccount.Settlement
      },
      type: AccountType.Debit
    },
    {
      asset: {
        unit,
        account: AssetAccount.Sent
      },
      type: AccountType.Debit
    },
    {
      asset: {
        unit,
        account: AssetAccount.ReceiveLimit
      },
      type: AccountType.Credit
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
    },
    {
      id,
      asBalance: Balance.TotalSent
    },
    {
      id,
      asBalance: Balance.ReceiveLimit
    }
  ])

  // TODO: sort accounts by id if order isn't guaranteed
  if (accounts.length) {
    const account = accounts[0]
    let totalSent: bigint | undefined
    let receiveLimit: bigint | undefined
    for (let i = 1; i < accounts.length; i++) {
      if (
        !totalSent &&
        accounts[i]?.id === accounts[0].id + BigInt(Balance.TotalSent)
      ) {
        totalSent = calculateBalance(accounts[i])
      } else {
        assert.ok(
          accounts[i]?.id === accounts[0].id + BigInt(Balance.ReceiveLimit)
        )
        receiveLimit = calculateBalance(accounts[i])
      }
    }
    return {
      id,
      asset: {
        unit: account.unit
      },
      type:
        account.flags & AccountFlags.credits_must_not_exceed_debits
          ? AccountType.Debit
          : AccountType.Credit,
      balance: calculateBalance(account),
      totalSent,
      receiveLimit
    }
  }
}

export async function getAccountBalance(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (await getAccounts(deps, [{ id }]))[0]

  if (account) {
    return calculateBalance(account)
  }
}

export async function getTotalSent(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (
    await getAccounts(deps, [{ id, asBalance: Balance.TotalSent }])
  )[0]

  if (account) {
    return calculateBalance(account)
  }
}

export async function getReceiveLimit(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (
    await getAccounts(deps, [{ id, asBalance: Balance.ReceiveLimit }])
  )[0]

  if (account) {
    return calculateBalance(account)
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

export async function transferFunds(
  deps: ServiceDependencies,
  {
    sourceAccount,
    destinationAccount,
    sourceAmount,
    destinationAmount,
    timeout
  }: AccountTransferOptions
): Promise<AccountTransfer | TransferError> {
  if (sourceAccount.id === destinationAccount.id) {
    return TransferError.SameAccounts
  }
  if (sourceAmount <= BigInt(0)) {
    return TransferError.InvalidSourceAmount
  }
  if (destinationAmount !== undefined && destinationAmount <= BigInt(0)) {
    return TransferError.InvalidDestinationAmount
  }
  const transfers: Required<CreateTransferOptions>[] = []

  // Same asset
  if (sourceAccount.asset.unit === destinationAccount.asset.unit) {
    transfers.push({
      id: uuid(),
      sourceAccount,
      destinationAccount,
      amount:
        destinationAmount && destinationAmount < sourceAmount
          ? destinationAmount
          : sourceAmount,
      timeout
    })
    // Same asset, different amounts
    if (destinationAmount && sourceAmount !== destinationAmount) {
      // Send excess source amount to liquidity account
      if (destinationAmount < sourceAmount) {
        transfers.push({
          id: uuid(),
          sourceAccount,
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
          destinationAccount,
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
        sourceAccount,
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
        destinationAccount,
        amount: destinationAmount,
        timeout
      }
    )
  }
  if (sourceAccount.withBalance === Balance.TotalSent) {
    transfers.push({
      id: uuid(),
      sourceAccount: {
        asset: {
          unit: sourceAccount.asset.unit,
          account: AssetAccount.Sent
        }
      },
      destinationAccount: {
        ...sourceAccount,
        asBalance: Balance.TotalSent
      },
      amount: sourceAmount,
      timeout
    })
  }
  if (destinationAccount.withBalance === Balance.ReceiveLimit) {
    transfers.push({
      id: uuid(),
      sourceAccount: {
        asset: {
          unit: destinationAccount.asset.unit,
          account: AssetAccount.ReceiveLimit
        }
      },
      destinationAccount: {
        ...destinationAccount,
        asBalance: Balance.ReceiveLimit
      },
      amount: destinationAmount || sourceAmount,
      timeout
    })
  }
  const error = await createTransfers(deps, transfers)
  if (error) {
    switch (error.error) {
      case TransferError.UnknownSourceBalance:
        throw new UnknownAccountError(transfers[error.index].sourceAccount)
      case TransferError.UnknownDestinationBalance:
        throw new UnknownAccountError(transfers[error.index].destinationAccount)
      case TransferError.InsufficientBalance:
        // Exceeding the account's receive limit debit balance might also
        // exceed the corresponding asset receive limit credit balance.
        if (
          destinationAccount.withBalance === Balance.ReceiveLimit &&
          error.index === transfers.length - 1
        ) {
          return TransferError.ReceiveLimitExceeded
        }
        if (error.index === 1) {
          return TransferError.InsufficientLiquidity
        }
        return TransferError.InsufficientBalance
      case TransferError.InsufficientDebitBalance:
        if (
          destinationAccount.withBalance === Balance.ReceiveLimit &&
          error.index === transfers.length - 1
        ) {
          return TransferError.ReceiveLimitExceeded
        }
        throw new BalanceTransferError(error.error)
      default:
        throw new BalanceTransferError(error.error)
    }
  }

  const trx: AccountTransfer = {
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
