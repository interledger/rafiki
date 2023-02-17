/* eslint-disable @typescript-eslint/no-unused-vars */
import { TransactionOrKnex } from 'objection'
import { v4 as uuid } from 'uuid'
import { Asset } from '../../asset/model'
import { BaseService } from '../../shared/baseService'
import { isTransferError, TransferError } from '../errors'
import {
  AccountingService,
  Deposit,
  LiquidityAccount,
  LiquidityAccountType,
  Transaction,
  TransferOptions,
  Withdrawal
} from '../service'
import { getAccountBalances } from './balance'
import {
  createAccount,
  getLiquidityAccount,
  getSettlementAccount
} from './ledger-account'
import {
  LedgerAccount,
  LedgerAccountType,
  mapLiquidityAccountTypeToLedgerAccountType
} from './ledger-account/model'
import {
  CreateTransferArgs,
  createTransfers,
  postTransfer,
  voidTransfer
} from './ledger-transfer'
import { LedgerTransferType } from './ledger-transfer/model'

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  withdrawalThrottleDelay?: number
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
    postWithdrawal: (withdrawalRef) => postTransfer(deps, withdrawalRef),
    voidWithdrawal: (withdrawalRef) => voidTransfer(deps, withdrawalRef)
  }
}

export async function createLiquidityAccount(
  deps: ServiceDependencies,
  account: LiquidityAccount,
  accountType: LiquidityAccountType,
  trx?: TransactionOrKnex
): Promise<LiquidityAccount> {
  await createAccount(
    deps,
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

  await createAccount(
    deps,
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
  const account = await getLiquidityAccount(deps, accountRef)

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
  const account = await getLiquidityAccount(deps, accountRef)

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
  const account = await getLiquidityAccount(deps, accountRef)

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

  const settlementAccount = await getSettlementAccount(deps, asset.id)

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

export async function createTransfer(
  deps: ServiceDependencies,
  args: TransferOptions
): Promise<Transaction | TransferError> {
  const {
    sourceAccount: {
      id: sourceAccountRef,
      asset: { id: sourceAssetRef, ledger: sourceAccountLedger }
    },
    destinationAccount: {
      id: destinationAccountRef,
      asset: { id: destinationAssetRef, ledger: destinationAccountLedger },
      onCredit: onDestinationAccountCredit
    },
    sourceAmount,
    destinationAmount,
    timeout
  } = args

  if (sourceAccountRef === destinationAccountRef) {
    return TransferError.SameAccounts
  }

  if (sourceAmount <= 0n) {
    return TransferError.InvalidSourceAmount
  }

  if (destinationAmount !== undefined && destinationAmount <= 0n) {
    return TransferError.InvalidDestinationAmount
  }

  const [
    sourceAccount,
    sourceAssetAccount,
    destinationAccount,
    destinationAssetAccount
  ] = await Promise.all([
    getLiquidityAccount(deps, sourceAccountRef),
    getLiquidityAccount(deps, sourceAssetRef),
    getLiquidityAccount(deps, destinationAccountRef),
    getLiquidityAccount(deps, destinationAssetRef)
  ])

  if (!sourceAccount || !sourceAssetAccount) {
    return TransferError.UnknownSourceAccount
  }

  if (!destinationAccount || !destinationAssetAccount) {
    return TransferError.UnknownDestinationAccount
  }

  const transfers: CreateTransferArgs[] = []

  const addTransfer = ({
    debitAccount,
    creditAccount,
    amount
  }: {
    debitAccount: LedgerAccount
    creditAccount: LedgerAccount
    amount: bigint
  }) => {
    transfers.push({
      transferRef: uuid(),
      debitAccount,
      creditAccount,
      amount,
      timeoutMs: timeout
    })
  }

  if (sourceAccountLedger === destinationAccountLedger) {
    addTransfer({
      debitAccount: sourceAccount,
      creditAccount: destinationAccount,
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
          debitAccount: sourceAccount,
          creditAccount: sourceAssetAccount,
          amount: sourceAmount - destinationAmount
        })
        // Deliver excess destination amount from liquidity account
      } else {
        addTransfer({
          debitAccount: destinationAssetAccount,
          creditAccount: destinationAccount,
          amount: destinationAmount - sourceAmount
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
      debitAccount: sourceAccount,
      creditAccount: sourceAssetAccount,
      amount: sourceAmount
    })
    addTransfer({
      debitAccount: destinationAssetAccount,
      creditAccount: destinationAccount,
      amount: destinationAmount
    })
  }

  const { errors } = await createTransfers(deps, transfers)

  if (errors.length > 0) {
    if (
      errors.find(
        ({ error, index }) =>
          error === TransferError.InsufficientBalance &&
          transfers[index].debitAccount.id === destinationAssetAccount.id
      )
    ) {
      return TransferError.InsufficientLiquidity
    }

    return errors[0].error
  }

  const trx: Transaction = {
    post: async (): Promise<void | TransferError> => {
      const results = await Promise.all(
        transfers.map((transfer) => postTransfer(deps, transfer.transferRef))
      )

      const error = results.find((result) => isTransferError(result))

      if (error) {
        return error
      }

      if (onDestinationAccountCredit) {
        const totalReceived = await getAccountTotalReceived(
          deps,
          destinationAccountRef
        )

        if (totalReceived === undefined) {
          throw new Error()
        }

        await onDestinationAccountCredit({
          totalReceived,
          withdrawalThrottleDelay: deps.withdrawalThrottleDelay
        })
      }
    },
    void: async (): Promise<void | TransferError> => {
      const results = await Promise.all(
        transfers.map((transfer) => voidTransfer(deps, transfer.transferRef))
      )

      const error = results.find((result) => isTransferError(result))

      if (error) {
        return error
      }
    }
  }
  return trx
}

async function createAccountDeposit(
  deps: ServiceDependencies,
  args: Deposit
): Promise<void | TransferError> {
  const {
    id: transferRef,
    account: {
      id: accountRef,
      asset: { id: assetRef }
    },
    amount
  } = args

  const [account, settlementAccount] = await Promise.all([
    getLiquidityAccount(deps, accountRef),
    getSettlementAccount(deps, assetRef)
  ])

  if (!account) {
    return TransferError.UnknownDestinationAccount
  }

  if (!settlementAccount) {
    return TransferError.UnknownSourceAccount
  }

  const transfer: CreateTransferArgs = {
    transferRef,
    debitAccount: settlementAccount,
    creditAccount: account,
    amount,
    type: LedgerTransferType.DEPOSIT
  }

  const { errors } = await createTransfers(deps, [transfer])

  if (errors[0]) {
    return errors[0].error
  }
}

async function createAccountWithdrawal(
  deps: ServiceDependencies,
  args: Withdrawal
): Promise<void | TransferError> {
  const {
    id: transferRef,
    account: {
      id: accountRef,
      asset: { id: assetRef }
    },
    amount,
    timeout
  } = args

  const [account, settlementAccount] = await Promise.all([
    getLiquidityAccount(deps, accountRef),
    getSettlementAccount(deps, assetRef)
  ])

  if (!account) {
    return TransferError.UnknownSourceAccount
  }

  if (!settlementAccount) {
    return TransferError.UnknownDestinationAccount
  }

  const transfer: CreateTransferArgs = {
    transferRef,
    debitAccount: account,
    creditAccount: settlementAccount,
    amount,
    type: LedgerTransferType.WITHDRAWAL,
    timeoutMs: timeout
  }

  const { errors } = await createTransfers(deps, [transfer])

  if (errors[0]) {
    return errors[0].error
  }
}
