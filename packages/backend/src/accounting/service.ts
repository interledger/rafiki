import assert from 'assert'
import { Client } from 'tigerbeetle-node'
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
  isAllAccountExistsErrors,
  TransferError,
  UnknownAccountError
} from './errors'
import { CreateTransferOptions, createTransfers } from './transfers'
import { BaseService } from '../shared/baseService'
import { validateId } from '../shared/utils'
import { toTigerbeetleId } from './utils'

enum AccountCode {
  Liquidity = 1,
  Settlement
}

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
// Their account id is the corresponding asset's ledger value.
export interface LiquidityAccount {
  id: string
  asset: {
    id: string
    ledger: number
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
  createSettlementAccount(ledger: number): Promise<void>
  getBalance(id: string): Promise<bigint | undefined>
  getTotalSent(id: string): Promise<bigint | undefined>
  getAccountsTotalSent(ids: string[]): Promise<(bigint | undefined)[]>
  getTotalReceived(id: string): Promise<bigint | undefined>
  getAccountsTotalReceived(ids: string[]): Promise<(bigint | undefined)[]>
  getSettlementBalance(ledger: number): Promise<bigint | undefined>
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
    createSettlementAccount: (ledger) => createSettlementAccount(deps, ledger),
    getBalance: (id) => getAccountBalance(deps, id),
    getTotalSent: (id) => getAccountTotalSent(deps, id),
    getAccountsTotalSent: (ids) => getAccountsTotalSent(deps, ids),
    getTotalReceived: (id) => getAccountTotalReceived(deps, id),
    getAccountsTotalReceived: (ids) => getAccountsTotalReceived(deps, ids),
    getSettlementBalance: (ledger) => getSettlementBalance(deps, ledger),
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
      ledger: account.asset.ledger,
      code: AccountCode.Liquidity
    }
  ])
  return account
}

export async function createSettlementAccount(
  deps: ServiceDependencies,
  ledger: number
): Promise<void> {
  try {
    await createAccounts(deps, [
      {
        id: ledger,
        type: AccountType.Debit,
        ledger,
        code: AccountCode.Settlement
      }
    ])
  } catch (err) {
    // Don't complain if asset settlement account already exists.
    // This could change if TigerBeetle could be reset between tests.
    if (
      err instanceof CreateAccountError &&
      isAllAccountExistsErrors(err.codes)
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
    return account.debits_posted
  }
}

export async function getAccountsTotalSent(
  deps: ServiceDependencies,
  ids: string[]
): Promise<(bigint | undefined)[]> {
  if (ids.length > 0) {
    const accounts = await getAccounts(deps, ids)
    return ids.map(
      (id) =>
        accounts.find((account) => account.id === toTigerbeetleId(id))
          ?.debits_posted
    )
  } else return []
}

export async function getAccountTotalReceived(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (await getAccounts(deps, [id]))[0]
  if (account) {
    return account.credits_posted
  }
}

export async function getAccountsTotalReceived(
  deps: ServiceDependencies,
  ids: string[]
): Promise<(bigint | undefined)[]> {
  if (ids.length > 0) {
    const accounts = await getAccounts(deps, ids)
    return ids.map(
      (id) =>
        accounts.find((account) => account.id === toTigerbeetleId(id))
          ?.credits_posted
    )
  } else return []
}

export async function getSettlementBalance(
  deps: ServiceDependencies,
  ledger: number
): Promise<bigint | undefined> {
  const assetAccount = (await getAccounts(deps, [ledger]))[0]

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
    amount,
    ledger
  }: {
    sourceAccountId: string
    destinationAccountId: string
    amount: bigint
    ledger: number
  }) => {
    transfers.push({
      id: uuid(),
      pendingId: '0',
      sourceAccountId,
      destinationAccountId,
      amount,
      timeout,
      ledger
    })
  }

  // Same asset / ledger:
  if (sourceAccount.asset.ledger === destinationAccount.asset.ledger) {
    addTransfer({
      sourceAccountId: sourceAccount.id,
      destinationAccountId: destinationAccount.id,
      amount:
        destinationAmount && destinationAmount < sourceAmount
          ? destinationAmount
          : sourceAmount,
      ledger: sourceAccount.asset.ledger
    })
    // Same asset, different amounts
    if (destinationAmount && sourceAmount !== destinationAmount) {
      // Send excess source amount to liquidity account
      if (destinationAmount < sourceAmount) {
        addTransfer({
          sourceAccountId: sourceAccount.id,
          destinationAccountId: sourceAccount.asset.id,
          amount: sourceAmount - destinationAmount,
          ledger: sourceAccount.asset.ledger
        })
        // Deliver excess destination amount from liquidity account
      } else {
        addTransfer({
          sourceAccountId: destinationAccount.asset.id,
          destinationAccountId: destinationAccount.id,
          amount: destinationAmount - sourceAmount,
          ledger: sourceAccount.asset.ledger
        })
      }
    }
    // Different assets / ledgers:
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
      amount: sourceAmount,
      ledger: sourceAccount.asset.ledger
    })
    addTransfer({
      sourceAccountId: destinationAccount.asset.id,
      destinationAccountId: destinationAccount.id,
      amount: destinationAmount,
      ledger: destinationAccount.asset.ledger
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
      const error = await createTransfers(
        deps,
        transfers.map((transfer) => {
          return {
            ...transfer,
            timeout: undefined,
            pendingId: transfer.id,
            commit: true
          }
        })
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
      const error = await createTransfers(
        deps,
        transfers.map((transfer) => {
          return {
            ...transfer,
            timeout: undefined,
            pendingId: transfer.id,
            commit: false
          }
        })
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
      sourceAccountId: account.asset.ledger,
      destinationAccountId: account.id,
      amount,
      ledger: account.asset.ledger
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
      destinationAccountId: account.asset.ledger,
      amount,
      timeout,
      ledger: account.asset.ledger
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
  const transfers = await deps.tigerbeetle.lookupTransfers([
    toTigerbeetleId(withdrawalId)
  ])
  const error = await createTransfers(
    deps,
    [
      {
        id: Number(transfers[0].id),
        sourceAccountId: Number(transfers[0].debit_account_id),
        destinationAccountId: Number(transfers[0].credit_account_id),
        amount: transfers[0].amount,
        ledger: transfers[0].ledger
      }
    ],
    false
  )
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
  const transfers = await deps.tigerbeetle.lookupTransfers([
    toTigerbeetleId(withdrawalId)
  ])
  const error = await createTransfers(
    deps,
    [
      {
        id: Number(transfers[0].id),
        sourceAccountId: Number(transfers[0].debit_account_id),
        destinationAccountId: Number(transfers[0].credit_account_id),
        amount: transfers[0].amount,
        ledger: transfers[0].ledger
      }
    ],
    true
  )
  if (error) {
    return error.error
  }
}
