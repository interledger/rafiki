import assert from 'assert'
import {
  Account as TigerBeetleAccount,
  AccountFlags,
  Client,
  CreateAccountError as CreateTbAccountError
} from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { CreateAccountError } from './errors'
import { BaseService } from '../../shared/baseService'
import { uuidToBigInt } from '../../shared/utils'
import { BalanceTransferError, UnknownAccountError } from '../../shared/errors'
import { TransferService, TwoPhaseTransfer } from '../transfer/service'
import { TransferError, TransfersError } from '../transfer/errors'
import { AccountTransferError } from './errors'

const ACCOUNT_RESERVED = Buffer.alloc(48)
const ASSET_ACCOUNTS_RESERVED = 32

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
  asset: {
    unit: number
  }
  type: AccountType
  sentBalance?: boolean
  receiveLimit?: bigint
}

interface PrimaryAccountOptions {
  id: string
  asBalance?: never
  asset: {
    unit: number
    account?: never
  }
  totalSent?: bigint
  receiveLimit?: bigint
}

export enum Balance {
  TotalSent = 1,
  ReceiveLimit
}

type AccountBalanceOptions = Omit<PrimaryAccountOptions, 'asBalance'> & {
  asBalance: Balance
}

export enum AssetAccount {
  Liquidity = 1,
  Settlement,
  Sent,
  ReceiveLimit
}

interface AssetAccountOptions {
  id?: never
  asBalance?: never
  asset: {
    unit: number
    account: AssetAccount
  }
  totalSent?: never
  receiveLimit?: never
}

export type AccountOptions =
  | PrimaryAccountOptions
  | AccountBalanceOptions
  | AssetAccountOptions

const isAccountBalance = (o: AccountOptions): o is AccountBalanceOptions =>
  !!o.asBalance

export const isAssetAccount = (o: AccountOptions): o is AssetAccountOptions =>
  !!o.asset.account

function getBalanceId(accountId: string, type: Balance): bigint {
  return uuidToBigInt(accountId) + BigInt(type)
}

function getAssetAccountId(unit: number, type: AssetAccount): bigint {
  return BigInt(unit * ASSET_ACCOUNTS_RESERVED + type)
}

export function getAccountId(options: AccountOptions): bigint {
  if (isAssetAccount(options)) {
    return getAssetAccountId(options.asset.unit, options.asset.account)
  } else if (isAccountBalance(options)) {
    return getBalanceId(options.id, options.asBalance)
  }
  return uuidToBigInt(options.id)
}

export interface AccountTransferOptions {
  sourceAccount: AccountOptions
  destinationAccount: AccountOptions
  sourceAmount: bigint
  destinationAmount?: bigint
  timeout: bigint // nano-seconds
}

export interface AccountTransfer {
  commit: () => Promise<void | AccountTransferError>
  rollback: () => Promise<void | AccountTransferError>
}

export interface AccountService {
  create(options: CreateOptions): Promise<Account>
  createAssetAccounts(unit: number): Promise<void>
  get(id: string): Promise<Account | undefined>
  getBalance(id: string): Promise<bigint | undefined>
  getTotalSent(accountId: string): Promise<bigint | undefined>
  getReceiveLimit(accountId: string): Promise<bigint | undefined>
  getAssetAccountBalance(
    unit: number,
    account: AssetAccount
  ): Promise<bigint | undefined>
  transferFunds(
    options: AccountTransferOptions
  ): Promise<AccountTransfer | AccountTransferError>
}

interface ServiceDependencies extends BaseService {
  tigerbeetle: Client
  transferService: TransferService
}

export function createAccountService({
  logger,
  knex,
  tigerbeetle,
  transferService
}: ServiceDependencies): AccountService {
  const log = logger.child({
    service: 'AccountService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex: knex,
    tigerbeetle,
    transferService
  }
  return {
    create: (options) => createAccount(deps, options),
    createAssetAccounts: (unit) => createAssetAccounts(deps, unit),
    get: (id) => getAccount(deps, id),
    getBalance: (id) => getAccountBalance(deps, id),
    getTotalSent: (id) => getAccountTotalSent(deps, id),
    getReceiveLimit: (id) => getAccountReceiveLimit(deps, id),
    getAssetAccountBalance: (unit, account) =>
      getAssetAccountBalance(deps, unit, account),
    transferFunds: (options) => transferFunds(deps, options)
  }
}

async function createAccounts(
  deps: ServiceDependencies,
  accounts: {
    id: bigint
    type: AccountType
    unit: number
  }[]
): Promise<void> {
  const errors = await deps.tigerbeetle.createAccounts(
    accounts.map(({ id, type, unit }) => ({
      id,
      user_data: BigInt(0),
      reserved: ACCOUNT_RESERVED,
      unit,
      code: 0,
      flags:
        type === AccountType.Debit
          ? AccountFlags.credits_must_not_exceed_debits
          : AccountFlags.debits_must_not_exceed_credits,
      debits_accepted: BigInt(0),
      debits_reserved: BigInt(0),
      credits_accepted: BigInt(0),
      credits_reserved: BigInt(0),
      timestamp: 0n
    }))
  )
  for (const { code } of errors) {
    if (code !== CreateTbAccountError.linked_event_failed) {
      throw new CreateAccountError(code)
    }
  }
}

async function createAccount(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<Account> {
  const id = uuid()

  const accounts = [
    {
      id: uuidToBigInt(id),
      type: options.type,
      unit: options.asset.unit
    }
  ]

  if (options.sentBalance) {
    accounts.push({
      id: getBalanceId(id, Balance.TotalSent),
      unit: options.asset.unit,
      type: AccountType.Credit
    })
  }

  if (options.receiveLimit) {
    accounts.push({
      id: getBalanceId(id, Balance.ReceiveLimit),
      unit: options.asset.unit,
      type: AccountType.Debit
    })
  }

  await createAccounts(deps, accounts)

  let receiveLimit: bigint | undefined
  if (options.receiveLimit) {
    // Allow a little extra, to be more forgiving about (favorable) exchange rate fluctuations.
    receiveLimit = options.receiveLimit + BigInt(1)
    const transferError = await deps.transferService.create([
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

async function createAssetAccounts(
  deps: ServiceDependencies,
  unit: number
): Promise<void> {
  const accounts = [
    {
      id: getAssetAccountId(unit, AssetAccount.Liquidity),
      type: AccountType.Credit,
      unit
    },
    {
      id: getAssetAccountId(unit, AssetAccount.Settlement),
      type: AccountType.Debit,
      unit
    },
    {
      id: getAssetAccountId(unit, AssetAccount.Sent),
      type: AccountType.Debit,
      unit
    },
    {
      id: getAssetAccountId(unit, AssetAccount.ReceiveLimit),
      type: AccountType.Credit,
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
      err.code === CreateTbAccountError.exists
    ) {
      return
    }
    throw err
  }
}

async function getAccount(
  deps: ServiceDependencies,
  id: string
): Promise<Account | undefined> {
  const accountId = uuidToBigInt(id)
  const totalSentId = getBalanceId(id, Balance.TotalSent)
  const receiveLimitId = getBalanceId(id, Balance.ReceiveLimit)
  const accounts = await deps.tigerbeetle.lookupAccounts([
    accountId,
    totalSentId,
    receiveLimitId
  ])

  if (accounts.length) {
    const account = accounts[0]
    assert.ok(account.id === accountId)
    let totalSent: bigint | undefined
    let receiveLimit: bigint | undefined
    for (let i = 1; i < accounts.length; i++) {
      if (!totalSent && accounts[i]?.id === totalSentId) {
        totalSent = calculateBalance(accounts[i])
      } else {
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

function calculateBalance(account: TigerBeetleAccount): bigint {
  if (account.flags & AccountFlags.credits_must_not_exceed_debits) {
    return (
      account.debits_accepted -
      account.credits_accepted +
      account.debits_reserved
    )
  } else {
    return (
      account.credits_accepted -
      account.debits_accepted -
      account.debits_reserved
    )
  }
}

async function getAccountBalance(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (await deps.tigerbeetle.lookupAccounts([uuidToBigInt(id)]))[0]

  if (account) {
    return calculateBalance(account)
  }
}

async function getAccountTotalSent(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (
    await deps.tigerbeetle.lookupAccounts([getBalanceId(id, Balance.TotalSent)])
  )[0]

  if (account) {
    return calculateBalance(account)
  }
}

async function getAccountReceiveLimit(
  deps: ServiceDependencies,
  id: string
): Promise<bigint | undefined> {
  const account = (
    await deps.tigerbeetle.lookupAccounts([
      getBalanceId(id, Balance.ReceiveLimit)
    ])
  )[0]

  if (account) {
    return calculateBalance(account)
  }
}

async function getAssetAccountBalance(
  deps: ServiceDependencies,
  unit: number,
  account: AssetAccount
): Promise<bigint | undefined> {
  const assetAccount = (
    await deps.tigerbeetle.lookupAccounts([getAssetAccountId(unit, account)])
  )[0]

  if (assetAccount) {
    return calculateBalance(assetAccount)
  }
}

async function transferFunds(
  deps: ServiceDependencies,
  {
    sourceAccount,
    destinationAccount,
    sourceAmount,
    destinationAmount,
    timeout
  }: AccountTransferOptions
): Promise<AccountTransfer | AccountTransferError> {
  if (sourceAccount.id === destinationAccount.id) {
    return AccountTransferError.SameAccounts
  }
  if (sourceAmount <= BigInt(0)) {
    return AccountTransferError.InvalidSourceAmount
  }
  if (destinationAmount !== undefined && destinationAmount <= BigInt(0)) {
    return AccountTransferError.InvalidDestinationAmount
  }
  const transfers: TwoPhaseTransfer[] = []

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
      return AccountTransferError.InvalidDestinationAmount
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
  if (sourceAccount.totalSent != null) {
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
  if (destinationAccount.receiveLimit != null) {
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
  const error = await deps.transferService.create(transfers)
  if (error) {
    switch (error.error) {
      case TransferError.UnknownSourceBalance:
        if (error.index === 1) {
          throw new UnknownAccountError({
            asset: {
              unit: destinationAccount.asset.unit,
              account: AssetAccount.Liquidity
            }
          })
        }
        throw new UnknownAccountError(sourceAccount)
      case TransferError.UnknownDestinationBalance:
        if (error.index === 1) {
          throw new UnknownAccountError(destinationAccount)
        }
        throw new UnknownAccountError({
          asset: {
            unit: sourceAccount.asset.unit,
            account: AssetAccount.Liquidity
          }
        })
      case TransferError.InsufficientBalance:
        // Exceeding the account's receive limit debit balance might also
        // exceed the corresponding asset receive limit credit balance.
        if (
          destinationAccount.receiveLimit !== undefined &&
          error.index === transfers.length - 1
        ) {
          return AccountTransferError.ReceiveLimitExceeded
        }
        if (error.index === 1) {
          return AccountTransferError.InsufficientLiquidity
        }
        return AccountTransferError.InsufficientBalance
      case TransferError.InsufficientDebitBalance:
        if (
          destinationAccount.receiveLimit !== undefined &&
          error.index === transfers.length - 1
        ) {
          return AccountTransferError.ReceiveLimitExceeded
        }
        throw new BalanceTransferError(error.error)
      default:
        throw new BalanceTransferError(error.error)
    }
  }

  const trx: AccountTransfer = {
    commit: async (): Promise<void | AccountTransferError> => {
      const error = await deps.transferService.commit(
        transfers.map((transfer) => transfer.id)
      )
      if (error) {
        return toAccountTransferError(error)
      }
    },
    rollback: async (): Promise<void | AccountTransferError> => {
      const error = await deps.transferService.rollback(
        transfers.map((transfer) => transfer.id)
      )
      if (error) {
        return toAccountTransferError(error)
      }
    }
  }
  return trx
}

function toAccountTransferError({
  error
}: TransfersError): AccountTransferError {
  switch (error) {
    case TransferError.TransferExpired:
      return AccountTransferError.TransferExpired
    case TransferError.AlreadyCommitted:
      return AccountTransferError.AlreadyCommitted
    case TransferError.AlreadyRolledBack:
      return AccountTransferError.AlreadyRolledBack
    default:
      throw new BalanceTransferError(error)
  }
}
