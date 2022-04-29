import assert from 'assert'
import {
  Client,
  CreateAccountError as CreateAccountErrorCode
} from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import {
  AccountType,
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
  CreateTransferOptions,
  createTransfers,
  commitTransfers,
  rollbackTransfers
} from './transfers'
import { BaseService } from '../shared/baseService'
import { validateId } from '../shared/utils'
import { toTigerbeetleId } from './utils'

// Model classes that have a corresponding Tigerbeetle liquidity
// account SHOULD implement this LiquidityAccount interface and call
// createLiquidityAccount for each model instance.
// The Tigerbeetle account id will be the model id.
// Such models include:
//   ../asset/model
//   ../open_payments/account/model
//   ../open_payments/payment/incoming/model
//   ../open_payments/payment/outgoing/model
//   ../peer/model
// Asset settlement Tigerbeetle accounts are the only exception.
// Their account id is the corresponding asset's unit value.
export interface LiquidityAccount {
  id: string
  asset: {
    id: string
    unit: number
  }
  onCredit?: (options: OnCreditOptions) => Promise<LiquidityAccount>
}

export interface OnCreditOptions {
  totalReceived: bigint
  withdrawalThrottleDelay?: number
}

export interface Deposit {
  id: string
  account: LiquidityAccount
  amount: bigint
}

export interface Withdrawal extends Deposit {
  timeout?: bigint
}

export interface TransferOptions {
  sourceAccount: LiquidityAccount
  destinationAccount: LiquidityAccount
  sourceAmount: bigint
  destinationAmount?: bigint
  timeout: bigint
}

export interface Transaction {
  commit: () => Promise<void | TransferError>
  rollback: () => Promise<void | TransferError>
}

export interface AccountingService {
  createLiquidityAccount(account: LiquidityAccount): Promise<LiquidityAccount>
  createSettlementAccount(unit: number): Promise<void>
  getBalance(id: string): Promise<bigint | undefined>
  getTotalSent(id: string): Promise<bigint | undefined>
  getAccountTotalReceived(id: string): Promise<bigint | undefined>
  getAccountsTotalReceived(
    ids: string[]
  ): Promise<Record<string, bigint | undefined>>
  getSettlementBalance(unit: number): Promise<bigint | undefined>
  createTransfer(options: TransferOptions): Promise<Transaction | TransferError>
  createDeposit(deposit: Deposit): Promise<void | TransferError>
  createWithdrawal(withdrawal: Withdrawal): Promise<void | TransferError>
  commitWithdrawal(id: string): Promise<void | TransferError>
  rollbackWithdrawal(id: string): Promise<void | TransferError>
}

export interface ServiceDependencies extends BaseService {
  tigerbeetle: Client
  withdrawalThrottleDelay?: number
}

export function createAccountingService(
  deps_: ServiceDependencies
): AccountingService {
  const deps = {
    ...deps_,
    logger: deps_.logger.child({ service: 'AccountingService' })
  }
  return {
    createLiquidityAccount: (options) => createLiquidityAccount(deps, options),
    createSettlementAccount: (unit) => createSettlementAccount(deps, unit),
    getBalance: (id) => getAccountBalance(deps, id),
    getTotalSent: (id) => getAccountTotalSent(deps, id),
    getAccountTotalReceived: (id) => getAccountTotalReceived(deps, id),
    getAccountsTotalReceived: (ids) => getAccountsTotalReceived(deps, ids),
    getSettlementBalance: (unit) => getSettlementBalance(deps, unit),
    createTransfer: (options) => createTransfer(deps, options),
    createDeposit: (transfer) => createAccountDeposit(deps, transfer),
    createWithdrawal: (transfer) => createAccountWithdrawal(deps, transfer),
    commitWithdrawal: (options) => commitAccountWithdrawal(deps, options),
    rollbackWithdrawal: (options) => rollbackAccountWithdrawal(deps, options)
  }
}

export async function createLiquidityAccount(
  deps: ServiceDependencies,
  account: LiquidityAccount
): Promise<LiquidityAccount> {
  if (!validateId(account.id)) {
    throw new Error('unable to create account, invalid id')
  }

  await createAccounts(deps, [
    {
      id: account.id,
      type: AccountType.Credit,
      unit: account.asset.unit
    }
  ])
  return account
}

export async function createSettlementAccount(
  deps: ServiceDependencies,
  unit: number
): Promise<void> {
  try {
    await createAccounts(deps, [
      {
        id: unit,
        type: AccountType.Debit,
        unit
      }
    ])
  } catch (err) {
    // Don't complain if asset settlement account already exists.
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

export async function getAccountBalance(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (await getAccounts(deps, [id]))[0]
  if (account) {
    return calculateBalance(account)
  }
}

export async function getAccountTotalSent(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (await getAccounts(deps, [id]))[0]
  if (account) {
    return account.debits_accepted
  }
}

export async function getAccountTotalReceived(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (await getAccounts(deps, [id]))[0]
  if (account) {
    return account.credits_accepted
  }
}

export async function getAccountsTotalReceived(
  deps: ServiceDependencies,
  ids: string[]
): Promise<Record<string, bigint | undefined>> {
  const accounts = await getAccounts(deps, ids)
  return ids.reduce(
    (o, id) => ({
      ...o,
      [id]: accounts.find((account) => account.id === toTigerbeetleId(id))
        ?.credits_accepted
    }),
    {}
  )
}

export async function getSettlementBalance(
  deps: ServiceDependencies,
  unit: number
): Promise<bigint | undefined> {
  const assetAccount = (await getAccounts(deps, [unit]))[0]

  if (assetAccount) {
    return calculateBalance(assetAccount)
  }
}

export async function createTransfer(
  deps: ServiceDependencies,
  {
    sourceAccount,
    destinationAccount,
    sourceAmount,
    destinationAmount,
    timeout
  }: TransferOptions
): Promise<Transaction | TransferError> {
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

  const addTransfer = ({
    sourceAccountId,
    destinationAccountId,
    amount
  }: {
    sourceAccountId: string
    destinationAccountId: string
    amount: bigint
  }) => {
    transfers.push({
      id: uuid(),
      sourceAccountId,
      destinationAccountId,
      amount,
      timeout
    })
  }

  // Same asset
  if (sourceAccount.asset.unit === destinationAccount.asset.unit) {
    addTransfer({
      sourceAccountId: sourceAccount.id,
      destinationAccountId: destinationAccount.id,
      amount:
        destinationAmount && destinationAmount < sourceAmount
          ? destinationAmount
          : sourceAmount
    })
    // Same asset, different amounts
    if (destinationAmount && sourceAmount !== destinationAmount) {
      // Send excess source amount to liquidity account
      if (destinationAmount < sourceAmount) {
        addTransfer({
          sourceAccountId: sourceAccount.id,
          destinationAccountId: sourceAccount.asset.id,
          amount: sourceAmount - destinationAmount
        })
        // Deliver excess destination amount from liquidity account
      } else {
        addTransfer({
          sourceAccountId: destinationAccount.asset.id,
          destinationAccountId: destinationAccount.id,
          amount: destinationAmount - sourceAmount
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
    addTransfer({
      sourceAccountId: sourceAccount.id,
      destinationAccountId: sourceAccount.asset.id,
      amount: sourceAmount
    })
    addTransfer({
      sourceAccountId: destinationAccount.asset.id,
      destinationAccountId: destinationAccount.id,
      amount: destinationAmount
    })
  }
  const error = await createTransfers(deps, transfers)
  if (error) {
    switch (error.error) {
      case TransferError.UnknownSourceAccount:
        throw new UnknownAccountError(transfers[error.index].sourceAccountId)
      case TransferError.UnknownDestinationAccount:
        throw new UnknownAccountError(
          transfers[error.index].destinationAccountId
        )
      case TransferError.InsufficientBalance:
        if (
          transfers[error.index].sourceAccountId === destinationAccount.asset.id
        ) {
          return TransferError.InsufficientLiquidity
        }
        return TransferError.InsufficientBalance
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
      if (destinationAccount.onCredit) {
        const totalReceived = await getAccountTotalReceived(
          deps,
          destinationAccount.id
        )
        assert.ok(totalReceived !== undefined)
        await destinationAccount.onCredit({
          totalReceived,
          withdrawalThrottleDelay: deps.withdrawalThrottleDelay
        })
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

async function createAccountDeposit(
  deps: ServiceDependencies,
  { id, account, amount }: Deposit
): Promise<void | TransferError> {
  if (!validateId(id)) {
    return TransferError.InvalidId
  }
  const error = await createTransfers(deps, [
    {
      id,
      sourceAccountId: account.asset.unit,
      destinationAccountId: account.id,
      amount
    }
  ])
  if (error) {
    return error.error
  }
}

async function createAccountWithdrawal(
  deps: ServiceDependencies,
  { id, account, amount, timeout }: Withdrawal
): Promise<void | TransferError> {
  if (!validateId(id)) {
    return TransferError.InvalidId
  }
  const error = await createTransfers(deps, [
    {
      id,
      sourceAccountId: account.id,
      destinationAccountId: account.asset.unit,
      amount,
      timeout
    }
  ])
  if (error) {
    return error.error
  }
}

async function rollbackAccountWithdrawal(
  deps: ServiceDependencies,
  withdrawalId: string
): Promise<void | TransferError> {
  if (!validateId(withdrawalId)) {
    return TransferError.InvalidId
  }
  const error = await rollbackTransfers(deps, [withdrawalId])
  if (error) {
    return error.error
  }
}

async function commitAccountWithdrawal(
  deps: ServiceDependencies,
  withdrawalId: string
): Promise<void | TransferError> {
  if (!validateId(withdrawalId)) {
    return TransferError.InvalidId
  }
  const error = await commitTransfers(deps, [withdrawalId])
  if (error) {
    return error.error
  }
}
