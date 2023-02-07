import { Client } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import {
  calculateBalance,
  createAccounts,
  getAccounts,
  TigerbeetleAccountType
} from './accounts'
import {
  areAllAccountExistsErrors,
  TigerbeetleCreateAccountError,
  TigerbeetleUnknownAccountError
} from './errors'
import { NewTransferOptions, createTransfers } from './transfers'
import { BaseService } from '../../shared/baseService'
import { validateId } from '../../shared/utils'
import { toTigerbeetleId } from './utils'
import {
  AccountAlreadyExistsError,
  BalanceTransferError,
  TransferError
} from '../errors'
import {
  AccountingService,
  AccountType,
  Deposit,
  LiquidityAccount,
  LiquidityAccountTypes,
  Transaction,
  TransferOptions,
  Withdrawal
} from '../service'

export const convertToTigerbeetleAccountCode: {
  [key in AccountType]: number
} = {
  [AccountType.LIQUIDITY]: 1,
  [AccountType.LIQUIDITY_ASSET]: 2,
  [AccountType.LIQUIDITY_PEER]: 3,
  [AccountType.LIQUIDITY_INCOMING]: 4,
  [AccountType.LIQUIDITY_OUTGOING]: 5,
  [AccountType.SETTLEMENT]: 101
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
    // Model classes that have a corresponding Tigerbeetle liquidity
    // account SHOULD implement this LiquidityAccount interface and call
    // createLiquidityAccount for each model instance.
    // The Tigerbeetle account id will be the model id.
    // Such models include:
    //   ../asset/model
    //   ../open_payments/payment_pointer/model
    //   ../open_payments/payment/incoming/model
    //   ../open_payments/payment/outgoing/model
    //   ../peer/model
    // Asset settlement Tigerbeetle accounts are the only exception.
    // Their account id is the corresponding asset's ledger value.
    createLiquidityAccount: (options, accTypeCode) =>
      createLiquidityAccount(deps, options, accTypeCode),
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
    postWithdrawal: (options) => postAccountWithdrawal(deps, options),
    voidWithdrawal: (options) => voidAccountWithdrawal(deps, options)
  }
}

export async function createLiquidityAccount(
  deps: ServiceDependencies,
  account: LiquidityAccount,
  accountType?: LiquidityAccountTypes
): Promise<LiquidityAccount> {
  if (!validateId(account.id)) {
    throw new Error('unable to create account, invalid id')
  }
  try {
    await createAccounts(deps, [
      {
        id: account.id,
        type: TigerbeetleAccountType.Credit,
        ledger: account.asset.ledger,
        code: accountType
          ? convertToTigerbeetleAccountCode[accountType]
          : convertToTigerbeetleAccountCode[AccountType.LIQUIDITY]
      }
    ])
    return account
  } catch (err) {
    if (
      err instanceof TigerbeetleCreateAccountError &&
      areAllAccountExistsErrors([err.code])
    ) {
      throw new AccountAlreadyExistsError(`Tigerbeetle error code: ${err.code}`)
    }
    throw err
  }
}

export async function createSettlementAccount(
  deps: ServiceDependencies,
  ledger: number
): Promise<void> {
  try {
    await createAccounts(deps, [
      {
        id: ledger,
        type: TigerbeetleAccountType.Debit,
        ledger,
        code: convertToTigerbeetleAccountCode[AccountType.SETTLEMENT]
      }
    ])
  } catch (err) {
    // Don't complain if asset settlement account already exists.
    // This could change if TigerBeetle could be reset between tests.
    if (
      err instanceof TigerbeetleCreateAccountError &&
      areAllAccountExistsErrors([err.code])
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
  const transfers: NewTransferOptions[] = []

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
        throw new TigerbeetleUnknownAccountError(
          transfers[error.index].sourceAccountId
        )
      case TransferError.UnknownDestinationAccount:
        throw new TigerbeetleUnknownAccountError(
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
    post: async (): Promise<void | TransferError> => {
      const error = await createTransfers(
        deps,
        transfers.map((transfer) => ({ postId: transfer.id }))
      )
      if (error) {
        return error.error
      }
      if (destinationAccount.onCredit) {
        const totalReceived = await getAccountTotalReceived(
          deps,
          destinationAccount.id
        )

        if (totalReceived === undefined) {
          throw new Error()
        }

        await destinationAccount.onCredit({
          totalReceived,
          withdrawalThrottleDelay: deps.withdrawalThrottleDelay
        })
      }
    },
    void: async (): Promise<void | TransferError> => {
      const error = await createTransfers(
        deps,
        transfers.map((transfer) => ({ voidId: transfer.id }))
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

async function voidAccountWithdrawal(
  deps: ServiceDependencies,
  withdrawalId: string
): Promise<void | TransferError> {
  if (!validateId(withdrawalId)) {
    return TransferError.InvalidId
  }
  const error = await createTransfers(deps, [
    {
      voidId: withdrawalId
    }
  ])
  if (error) {
    return error.error
  }
}

async function postAccountWithdrawal(
  deps: ServiceDependencies,
  withdrawalId: string
): Promise<void | TransferError> {
  if (!validateId(withdrawalId)) {
    return TransferError.InvalidId
  }
  const error = await createTransfers(deps, [
    {
      postId: withdrawalId
    }
  ])
  if (error) {
    return error.error
  }
}
