/* eslint-disable @typescript-eslint/no-unused-vars */
import { TransactionOrKnex } from 'objection'
import { Asset } from '../../asset/model'
import { BaseService } from '../../shared/baseService'
import { TransferError } from '../errors'
import {
  AccountingService,
  Deposit,
  LiquidityAccount,
  LiquidityAccountType,
  Transaction,
  TransferOptions,
  Withdrawal
} from '../service'
import {
  LedgerAccount,
  LedgerAccountType,
  mapLiquidityAccountTypeToLedgerAccountType
} from './ledger-account/model'
import { LedgerAccountService } from './ledger-account/service'
import {
  LedgerTransfer,
  LedgerTransferState,
  LedgerTransferType
} from './ledger-transfer/model'
import {
  CreateTransferArgs,
  LedgerTransferService
} from './ledger-transfer/service'

export interface ServiceDependencies extends BaseService {
  ledgerAccountService: LedgerAccountService
  ledgerTransferService: LedgerTransferService
  withdrawalThrottleDelay?: number
}

interface AccountBalance {
  creditsPosted: bigint
  creditsPending: bigint
  debitsPosted: bigint
  debitsPending: bigint
}

interface ValidateTransferArgs {
  amount: bigint
  creditAccount: LedgerAccount
  debitAccount: LedgerAccount
}

export function createAccountingService(
  deps_: ServiceDependencies
): AccountingService {
  const deps = {
    ...deps_,
    logger: deps_.logger.child({ service: 'PsqlAccountingService' })
  }
  return {
    createLiquidityAccount: (options, accTypeCode, trx) =>
      createLiquidityAccount(deps, options, accTypeCode, trx),
    createSettlementAccount: (ledger, trx) =>
      createSettlementAccount(deps, ledger, trx),
    getBalance: (accountRef) => getLiquidityAccountBalance(deps, accountRef),
    getTotalSent: (accountRef) => getAccountTotalSent(deps, accountRef),
    getAccountsTotalSent: (accountRefs) =>
      getAccountsTotalSent(deps, accountRefs),
    getTotalReceived: (accountRef) => getAccountTotalReceived(deps, accountRef),
    getAccountsTotalReceived: (accountRefs) =>
      getAccountsTotalReceived(deps, accountRefs),
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
  accountType: LiquidityAccountType,
  trx?: TransactionOrKnex
): Promise<LiquidityAccount> {
  await deps.ledgerAccountService.create(
    {
      accountRef: account.id,
      ledger: account.asset.ledger,
      type: mapLiquidityAccountTypeToLedgerAccountType[accountType]
    },
    trx
  )

  return account
}

export async function createSettlementAccount(
  deps: ServiceDependencies,
  ledger: number,
  trx?: TransactionOrKnex
): Promise<void> {
  const asset = await Asset.query(trx || deps.knex).findOne({ ledger })
  if (!asset) {
    throw new Error(`Could not find asset by ledger value: ${ledger}`)
  }

  await deps.ledgerAccountService.create(
    {
      accountRef: asset.id,
      ledger,
      type: LedgerAccountType.SETTLEMENT
    },
    trx
  )
}

export async function getLiquidityAccountBalance(
  deps: ServiceDependencies,
  accountRef: string
): Promise<bigint | undefined> {
  const account = await deps.ledgerAccountService.getLiquidityAccount(
    accountRef
  )

  if (!account) {
    return
  }

  const { creditsPosted, debitsPending, debitsPosted } =
    await getAccountBalances(deps, account)

  return creditsPosted - debitsPosted - debitsPending
}

export async function getAccountTotalSent(
  deps: ServiceDependencies,
  accountRef: string
): Promise<bigint | undefined> {
  const account = await deps.ledgerAccountService.getLiquidityAccount(
    accountRef
  )

  if (!account) {
    return
  }

  return (await getAccountBalances(deps, account)).debitsPosted
}

export async function getAccountsTotalSent(
  deps: ServiceDependencies,
  accountRefs: string[]
): Promise<(bigint | undefined)[]> {
  return Promise.all(
    accountRefs.map((accountRef) => getAccountTotalSent(deps, accountRef))
  )
}

export async function getAccountTotalReceived(
  deps: ServiceDependencies,
  accountRef: string
): Promise<bigint | undefined> {
  const account = await deps.ledgerAccountService.getLiquidityAccount(
    accountRef
  )

  if (!account) {
    return
  }

  return (await getAccountBalances(deps, account)).creditsPosted
}

export async function getAccountsTotalReceived(
  deps: ServiceDependencies,
  accountRefs: string[]
): Promise<(bigint | undefined)[]> {
  return Promise.all(
    accountRefs.map((accountRef) => getAccountTotalReceived(deps, accountRef))
  )
}

export async function getSettlementBalance(
  deps: ServiceDependencies,
  ledger: number
): Promise<bigint | undefined> {
  const asset = await Asset.query(deps.knex).findOne({ ledger })
  if (!asset) {
    deps.logger.error(`Could not find asset by ledger value: ${ledger}`)
    return
  }

  const settlementAccount =
    await deps.ledgerAccountService.getSettlementAccount(asset.id)

  if (!settlementAccount) {
    deps.logger.error(
      {
        ledger,
        assetId: asset.id
      },
      'Could not find settlement account by account'
    )
    return
  }

  const { creditsPosted, debitsPending, debitsPosted } =
    await getAccountBalances(deps, settlementAccount)

  return debitsPosted + debitsPending - creditsPosted
}

function validateTransfer(
  args: ValidateTransferArgs
): TransferError | undefined {
  const { amount, creditAccount, debitAccount } = args

  if (amount <= 0n) {
    return TransferError.InvalidAmount
  }

  if (creditAccount.id === debitAccount.id) {
    return TransferError.SameAccounts
  }

  if (creditAccount.ledger !== debitAccount.ledger) {
    return TransferError.DifferentAssets
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
  throw new Error('Not implemented')
}

async function createAccountDeposit(
  deps: ServiceDependencies,
  args: Deposit
): Promise<void | TransferError> {
  const {
    id: transferRef,
    account: { id: accountRef, asset: accountAsset },
    amount
  } = args

  const [account, settlementAccount] = await Promise.all([
    deps.ledgerAccountService.getLiquidityAccount(accountRef),
    deps.ledgerAccountService.getSettlementAccount(accountAsset.id)
  ])

  if (!account) {
    return TransferError.UnknownDestinationAccount
  }

  if (!settlementAccount) {
    return TransferError.UnknownSourceAccount
  }

  const transferError = validateTransfer({
    amount,
    creditAccount: account,
    debitAccount: settlementAccount
  })

  if (transferError) {
    return transferError
  }

  const { creditsPosted, debitsPending, debitsPosted } =
    await getAccountBalances(deps, settlementAccount)

  if (debitsPending + debitsPosted + amount > creditsPosted) {
    return TransferError.InsufficientDebitBalance
  }

  const transfer: CreateTransferArgs = {
    transferRef,
    creditAccountId: account.id,
    debitAccountId: settlementAccount.id,
    amount,
    ledger: settlementAccount.ledger,
    type: LedgerTransferType.DEPOSIT,
    state: LedgerTransferState.POSTED
  }

  await deps.ledgerTransferService.createTransfers([transfer])
}

async function createAccountWithdrawal(
  deps: ServiceDependencies,
  { id, account, amount, timeout }: Withdrawal
): Promise<void | TransferError> {
  throw new Error('Not implemented')
}

async function voidAccountWithdrawal(
  deps: ServiceDependencies,
  withdrawalId: string
): Promise<void | TransferError> {
  throw new Error('Not implemented')
}

async function postAccountWithdrawal(
  deps: ServiceDependencies,
  withdrawalId: string
): Promise<void | TransferError> {
  throw new Error('Not implemented')
}

async function getAccountBalances(
  deps: ServiceDependencies,
  account: LedgerAccount
): Promise<AccountBalance> {
  const { credits, debits } =
    await deps.ledgerTransferService.getAccountTransfers(account.id)

  return {
    creditsPosted: sum(credits, LedgerTransferState.POSTED),
    creditsPending: sum(credits, LedgerTransferState.PENDING),
    debitsPosted: sum(debits, LedgerTransferState.POSTED),
    debitsPending: sum(debits, LedgerTransferState.PENDING)
  }
}

function sum(transfers: LedgerTransfer[], state: LedgerTransferState) {
  return transfers
    .filter((transfer) => transfer.state === state)
    .reduce((sum, transfer) => {
      return sum + transfer.amount
    }, 0n)
}
