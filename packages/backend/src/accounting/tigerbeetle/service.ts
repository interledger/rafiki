import { Client } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { calculateBalance, createAccounts, getAccounts } from './accounts'
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
  createAccountToAccountTransfer,
  Deposit,
  LiquidityAccount,
  LiquidityAccountType,
  Transaction,
  TransferOptions,
  Withdrawal
} from '../service'

export enum TigerbeetleAccountCode {
  LIQUIDITY_WEB_MONETIZATION = 1,
  LIQUIDITY_ASSET = 2,
  LIQUIDITY_PEER = 3,
  LIQUIDITY_INCOMING = 4,
  LIQUIDITY_OUTGOING = 5,
  SETTLEMENT = 101
}

export const convertToTigerbeetleAccountCode: {
  [key in LiquidityAccountType]: TigerbeetleAccountCode
} = {
  [LiquidityAccountType.WEB_MONETIZATION]:
    TigerbeetleAccountCode.LIQUIDITY_WEB_MONETIZATION,
  [LiquidityAccountType.ASSET]: TigerbeetleAccountCode.LIQUIDITY_ASSET,
  [LiquidityAccountType.PEER]: TigerbeetleAccountCode.LIQUIDITY_PEER,
  [LiquidityAccountType.INCOMING]: TigerbeetleAccountCode.LIQUIDITY_INCOMING,
  [LiquidityAccountType.OUTGOING]: TigerbeetleAccountCode.LIQUIDITY_OUTGOING
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
    createLiquidityAccount: (options, accountType) =>
      createLiquidityAccount(deps, options, accountType),
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
  accountType: LiquidityAccountType
): Promise<LiquidityAccount> {
  if (!validateId(account.id)) {
    throw new Error('unable to create account, invalid id')
  }
  try {
    await createAccounts(deps, [
      {
        id: account.id,
        ledger: account.asset.ledger,
        code: convertToTigerbeetleAccountCode[accountType]
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
        ledger,
        code: TigerbeetleAccountCode.SETTLEMENT
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
  args: TransferOptions
): Promise<Transaction | TransferError> {
  return createAccountToAccountTransfer({
    transferArgs: args,
    withdrawalThrottleDelay: deps.withdrawalThrottleDelay,
    voidTransfers: async (transferIds) => {
      const error = await createTransfers(
        deps,
        transferIds.map((transferId) => ({
          voidId: transferId
        }))
      )

      if (error) {
        return error.error
      }
    },
    postTransfers: async (transferIds) => {
      const error = await createTransfers(
        deps,
        transferIds.map((transferId) => ({
          postId: transferId
        }))
      )

      if (error) {
        return error.error
      }
    },
    getAccountReceived: async (accountRef) =>
      getAccountTotalReceived(deps, accountRef),
    createPendingTransfers: async (transfersToCreate) => {
      const tbTransfers: NewTransferOptions[] = transfersToCreate.map(
        (transfer) => ({
          id: uuid(),
          ledger: transfer.ledger,
          sourceAccountId: transfer.sourceAccountId,
          destinationAccountId: transfer.destinationAccountId,
          amount: transfer.amount,
          timeout: args.timeout
        })
      )

      const error = await createTransfers(deps, tbTransfers)

      if (error) {
        switch (error.error) {
          case TransferError.UnknownSourceAccount:
            throw new TigerbeetleUnknownAccountError(
              transfersToCreate[error.index].sourceAccountId
            )
          case TransferError.UnknownDestinationAccount:
            throw new TigerbeetleUnknownAccountError(
              transfersToCreate[error.index].destinationAccountId
            )
          case TransferError.InsufficientBalance:
            if (
              transfersToCreate[error.index].sourceAccountId ===
              args.destinationAccount.asset.id
            ) {
              return TransferError.InsufficientLiquidity
            }
            return TransferError.InsufficientBalance
          default:
            throw new BalanceTransferError(error.error)
        }
      }
      return tbTransfers.map((transfer) => transfer.id.toString())
    }
  })
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
