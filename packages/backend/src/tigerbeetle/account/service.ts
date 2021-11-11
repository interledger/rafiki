import assert from 'assert'
import { Errors } from 'ilp-packet'
import { ForeignKeyViolationError, Transaction } from 'objection'
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
import {
  BalanceTransferError,
  UnknownAccountError,
  UnknownLiquidityAccountError
} from '../../shared/errors'
import { TransferService, TwoPhaseTransfer } from '../transfer/service'
import { TransferError, TransfersError } from '../transfer/errors'
import { AccountTransferError, UnknownAssetError } from './errors'
import { Account } from './model'

const { AmountTooLargeError } = Errors

const ACCOUNT_RESERVED = Buffer.alloc(48)

// Credit and debit accounts can both send and receive
// but are restricted by their respective Tigerbeetle flags.
// In Rafiki transfers:
// - the source account's debits increase
// - the destination account's credits increase
export enum AccountType {
  Credit = 'Credit', // debits_must_not_exceed_credits
  Debit = 'Debit' // credits_must_not_exceed_debits
}

export interface CreateOptions {
  disabled?: boolean
  assetId: string
  sentBalance?: boolean
  receiveLimit?: bigint
  type: AccountType
}

export interface AccountTransferOptions {
  sourceAccount: Account
  destinationAccount: Account
  sourceAmount: bigint
  destinationAmount?: bigint
  timeout: bigint // nano-seconds
}

export interface AccountTransfer {
  commit: () => Promise<void | AccountTransferError>
  rollback: () => Promise<void | AccountTransferError>
}

export interface AccountService {
  create(account: CreateOptions, trx?: Transaction): Promise<Account>
  get(accountId: string): Promise<Account | undefined>
  getBalance(accountId: string): Promise<bigint | undefined>
  getTotalSent(accountId: string): Promise<bigint | undefined>
  getType(accountId: string): Promise<AccountType | undefined>
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
    create: (account, trx) => createAccount(deps, account, trx),
    get: (id) => getAccount(deps, id),
    getBalance: (id) => getAccountBalance(deps, id),
    getTotalSent: (id) => getAccountTotalSent(deps, id),
    getType: (id) => getAccountType(deps, id),
    transferFunds: (options) => transferFunds(deps, options)
  }
}

async function createTbAccounts(
  deps: ServiceDependencies,
  accounts: {
    id: string
    type: AccountType
    unit: number
  }[]
): Promise<void> {
  const errors = await deps.tigerbeetle.createAccounts(
    accounts.map(({ id, type, unit }) => ({
      id: uuidToBigInt(id),
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
  options: CreateOptions,
  trx?: Transaction
): Promise<Account> {
  const acctTrx = trx || (await Account.startTransaction())
  try {
    const account = await Account.query(acctTrx)
      .insertAndFetch({
        assetId: options.assetId,
        disabled: options.disabled
      })
      .withGraphFetched('asset')

    const tbAccounts = [
      {
        id: account.id,
        type: options.type,
        unit: account.asset.unit
      }
    ]

    if (options.sentBalance) {
      await account.$query(acctTrx).patch({
        sentBalanceId: uuid()
      })
      assert.ok(account.sentBalanceId)
      tbAccounts.push({
        id: account.sentBalanceId,
        type: AccountType.Credit,
        unit: account.asset.unit
      })
    }

    if (options.receiveLimit) {
      await account.$query(acctTrx).patch({
        receiveLimitBalanceId: uuid()
      })
      assert.ok(account.receiveLimitBalanceId)
      tbAccounts.push({
        id: account.receiveLimitBalanceId,
        type: AccountType.Debit,
        unit: account.asset.unit
      })
    }

    await createTbAccounts(deps, tbAccounts)

    if (options.receiveLimit && account.receiveLimitBalanceId) {
      const receiveLimitAccount = await account.asset.getReceiveLimitAccount()
      const transferError = await deps.transferService.create([
        {
          id: uuid(),
          sourceBalanceId: account.receiveLimitBalanceId,
          destinationBalanceId: receiveLimitAccount.id,
          // Allow a little extra, to be more forgiving about (favorable) exchange rate fluctuations.
          amount: options.receiveLimit + BigInt(1)
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

    if (!trx) {
      await acctTrx.commit()
    }
    return account
  } catch (err) {
    if (!trx) {
      await acctTrx.rollback()
    }
    if (
      err instanceof ForeignKeyViolationError &&
      err.constraint === 'accounts_assetid_foreign'
    ) {
      throw new UnknownAssetError(options.assetId)
    }
    throw err
  }
}

async function getAccount(
  deps: ServiceDependencies,
  accountId: string
): Promise<Account | undefined> {
  const account = await Account.query(deps.knex)
    .findById(accountId)
    .withGraphJoined('asset')

  return account || undefined
}

async function getAccountBalance(
  deps: ServiceDependencies,
  accountId: string
): Promise<bigint | undefined> {
  const account = (
    await deps.tigerbeetle.lookupAccounts([uuidToBigInt(accountId)])
  )[0]

  if (!account) {
    return undefined
  }

  return calculateBalance(deps, account)
}

function calculateBalance(
  deps: ServiceDependencies,
  account: TigerBeetleAccount
): bigint {
  if (account.flags & AccountFlags.credits_must_not_exceed_debits) {
    return (
      account.debits_accepted -
      account.credits_accepted +
      account.debits_reserved
    )
  } else {
    if (!(account.flags & AccountFlags.debits_must_not_exceed_credits)) {
      deps.logger.warn({ account }, 'account missing credit/debit flag')
    }
    return (
      account.credits_accepted -
      account.debits_accepted -
      account.debits_reserved
    )
  }
}

async function getAccountTotalSent(
  deps: ServiceDependencies,
  accountId: string
): Promise<bigint | undefined> {
  const account = await Account.query(deps.knex)
    .findById(accountId)
    .select('sentBalanceId')

  if (!account?.sentBalanceId) {
    return undefined
  }

  return getAccountBalance(deps, account.sentBalanceId)
}

async function getAccountType(
  deps: ServiceDependencies,
  accountId: string
): Promise<AccountType | undefined> {
  const account = (
    await deps.tigerbeetle.lookupAccounts([uuidToBigInt(accountId)])
  )[0]

  if (!account) {
    return undefined
  }

  return account.flags & AccountFlags.credits_must_not_exceed_debits
    ? AccountType.Debit
    : AccountType.Credit
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
  if (
    sourceAccount.asset.code === destinationAccount.asset.code &&
    sourceAccount.asset.scale === destinationAccount.asset.scale
  ) {
    transfers.push({
      id: uuid(),
      sourceBalanceId: sourceAccount.id,
      destinationBalanceId: destinationAccount.id,
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
        const sourceLiquidityAccount = await sourceAccount.asset.getLiquidityAccount()
        transfers.push({
          id: uuid(),
          sourceBalanceId: sourceAccount.id,
          destinationBalanceId: sourceLiquidityAccount.id,
          amount: sourceAmount - destinationAmount,
          timeout
        })
        // Deliver excess destination amount from liquidity account
      } else {
        const destinationLiquidityAccount = await destinationAccount.asset.getLiquidityAccount()
        transfers.push({
          id: uuid(),
          sourceBalanceId: destinationLiquidityAccount.id,
          destinationBalanceId: destinationAccount.id,
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
    const sourceLiquidityAccount = await sourceAccount.asset.getLiquidityAccount()
    const destinationLiquidityAccount = await destinationAccount.asset.getLiquidityAccount()
    transfers.push(
      {
        id: uuid(),
        sourceBalanceId: sourceAccount.id,
        destinationBalanceId: sourceLiquidityAccount.id,
        amount: sourceAmount,
        timeout
      },
      {
        id: uuid(),
        sourceBalanceId: destinationLiquidityAccount.id,
        destinationBalanceId: destinationAccount.id,
        amount: destinationAmount,
        timeout
      }
    )
  }
  if (sourceAccount.sentBalanceId) {
    const sentAccount = await sourceAccount.asset.getSentAccount()
    transfers.push({
      id: uuid(),
      sourceBalanceId: sentAccount.id,
      destinationBalanceId: sourceAccount.sentBalanceId,
      amount: sourceAmount,
      timeout
    })
  }
  if (destinationAccount.receiveLimitBalanceId) {
    const receiveLimitAccount = await destinationAccount.asset.getReceiveLimitAccount()
    transfers.push({
      id: uuid(),
      sourceBalanceId: receiveLimitAccount.id,
      destinationBalanceId: destinationAccount.receiveLimitBalanceId,
      amount: destinationAmount || sourceAmount,
      timeout
    })
  }
  const error = await deps.transferService.create(transfers)
  if (error) {
    switch (error.error) {
      case TransferError.UnknownSourceBalance:
        if (error.index === 1) {
          throw new UnknownLiquidityAccountError(destinationAccount.asset)
        }
        throw new UnknownAccountError(sourceAccount.id)
      case TransferError.UnknownDestinationBalance:
        if (error.index === 1) {
          throw new UnknownAccountError(destinationAccount.id)
        }
        throw new UnknownLiquidityAccountError(sourceAccount.asset)
      case TransferError.InsufficientBalance:
        if (
          destinationAccount.receiveLimitBalanceId &&
          error.index === transfers.length - 1
        ) {
          const receivedAmount = (destinationAmount || sourceAmount).toString()
          const maximumAmount = ((await getAccountBalance(
            deps,
            destinationAccount.receiveLimitBalanceId
          )) as bigint).toString()
          throw new AmountTooLargeError(
            `amount too large. maxAmount=${maximumAmount} actualAmount=${receivedAmount}`,
            {
              receivedAmount,
              maximumAmount
            }
          )
        }
        if (error.index === 1) {
          return AccountTransferError.InsufficientLiquidity
        }
        return AccountTransferError.InsufficientBalance
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
