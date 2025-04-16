/* eslint-disable @typescript-eslint/no-unused-vars */
import { TransactionOrKnex } from 'objection'
import { v4 as uuid } from 'uuid'
import { Asset } from '../../asset/model'
import { BaseService } from '../../shared/baseService'
import { isTransferError, TransferError } from '../errors'
import {
  AccountingService,
  createAccountToAccountTransfer,
  Deposit,
  LiquidityAccount,
  LiquidityAccountType,
  Transaction,
  TransferOptions,
  TransferToCreate,
  Withdrawal
} from '../service'
import { getAccountBalances } from './balance'
import {
  createAccount,
  getLiquidityAccount,
  getSettlementAccount
} from './ledger-account'
import {
  LedgerAccountType,
  mapLiquidityAccountTypeToLedgerAccountType
} from './ledger-account/model'
import {
  CreateLedgerTransferArgs,
  createTransfers,
  CreateTransfersResult,
  postTransfers,
  voidTransfers,
  getAccountTransfers
} from './ledger-transfer'
import { LedgerTransfer, LedgerTransferType } from './ledger-transfer/model'
import { TelemetryService } from '../../telemetry/service'
import { IAppConfig } from '../../config/app'

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  config: IAppConfig
  telemetry: TelemetryService
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
    createLiquidityAndLinkedSettlementAccount: (options, accTypeCode, trx) =>
      createLiquidityAndLinkedSettlementAccount(
        deps,
        options,
        accTypeCode,
        trx
      ),
    getBalance: (accountRef) => getLiquidityAccountBalance(deps, accountRef),
    getTotalSent: (accountRef) => getAccountTotalSent(deps, accountRef),
    getAccountsTotalSent: (accountRefs) =>
      getAccountsTotalSent(deps, accountRefs),
    getTotalReceived: (accountRef) => getAccountTotalReceived(deps, accountRef),
    getAccountsTotalReceived: (accountRefs) =>
      getAccountsTotalReceived(deps, accountRefs),
    getSettlementBalance: (ledger) => getSettlementBalance(deps, ledger),
    createTransfer: (options) => createTransfer(deps, options),
    createDeposit: (transfer, trx) => createAccountDeposit(deps, transfer, trx),
    createWithdrawal: (transfer) => createAccountWithdrawal(deps, transfer),
    postWithdrawal: (withdrawalRef) => postTransfers(deps, [withdrawalRef]),
    voidWithdrawal: (withdrawalRef) => voidTransfers(deps, [withdrawalRef]),
    getAccountTransfers: (id, limit, trx) =>
      getAccountTransfers(deps, id, limit, trx)
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

export async function createLiquidityAndLinkedSettlementAccount(
  deps: ServiceDependencies,
  account: LiquidityAccount,
  accountType: LiquidityAccountType,
  trx?: TransactionOrKnex
): Promise<LiquidityAccount> {
  await createLiquidityAccount(deps, account, accountType, trx)
  await createSettlementAccount(deps, account.asset.ledger, trx)
  return account
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
  const stopTimer = deps.telemetry.startTimer(
    'psql_get_account_total_sent_ms',
    {
      callName: 'AccountingService:Postgres:getAccountTotalSent'
    }
  )
  const account = await getLiquidityAccount(deps, accountRef)

  if (!account) {
    stopTimer()
    return
  }

  const totalsSent = (await getAccountBalances(deps, account)).debitsPosted
  stopTimer()
  return totalsSent
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
  const stopTimer = deps.telemetry.startTimer('psql_create_transfer_ms', {
    callName: 'AccountingService:Postgres:createTransfer'
  })
  try {
    return createAccountToAccountTransfer(deps, {
      transferArgs: args,
      voidTransfers: async (transferRefs) => voidTransfers(deps, transferRefs),
      postTransfers: async (transferRefs) => postTransfers(deps, transferRefs),
      getAccountReceived: async (accountRef) =>
        getAccountTotalReceived(deps, accountRef),
      getAccountBalance: async (accountRef) =>
        getLiquidityAccountBalance(deps, accountRef),
      createPendingTransfers: async (transfersToCreate) => {
        const [
          sourceAccount,
          sourceAssetAccount,
          destinationAccount,
          destinationAssetAccount
        ] = await Promise.all([
          getLiquidityAccount(deps, args.sourceAccount.id),
          getLiquidityAccount(deps, args.sourceAccount.asset.id),
          getLiquidityAccount(deps, args.destinationAccount.id),
          getLiquidityAccount(deps, args.destinationAccount.asset.id)
        ])

        if (!sourceAccount || !sourceAssetAccount) {
          return TransferError.UnknownSourceAccount
        }

        if (!destinationAccount || !destinationAssetAccount) {
          return TransferError.UnknownDestinationAccount
        }

        const accountMap = {
          [sourceAccount.accountRef]: sourceAccount,
          [sourceAssetAccount.accountRef]: sourceAssetAccount,
          [destinationAccount.accountRef]: destinationAccount,
          [destinationAssetAccount.accountRef]: destinationAssetAccount
        }

        const pendingTransfersOrError = handleTransferCreateResults(
          args,
          transfersToCreate,
          await createTransfers(
            deps,
            transfersToCreate.map((transfer) => ({
              transferRef: uuid(),
              debitAccount: accountMap[transfer.sourceAccountId],
              creditAccount: accountMap[transfer.destinationAccountId],
              amount: transfer.amount,
              timeoutMs: BigInt(args.timeout * 1000)
            }))
          )
        )

        if (isTransferError(pendingTransfersOrError)) {
          return pendingTransfersOrError
        }

        return pendingTransfersOrError.map(
          (pendingTransfer) => pendingTransfer.transferRef
        )
      }
    })
  } finally {
    stopTimer()
  }
}

function handleTransferCreateResults(
  args: TransferOptions,
  attemptedTransfers: TransferToCreate[],
  createTransferResults: CreateTransfersResult
): LedgerTransfer[] | TransferError {
  const { errors, results: pendingTransfers } = createTransferResults

  if (errors.length > 0) {
    if (
      errors.find(
        ({ error, index }) =>
          error === TransferError.InsufficientBalance &&
          attemptedTransfers[index]?.sourceAccountId ===
            args.destinationAccount.asset.id
      )
    ) {
      return TransferError.InsufficientLiquidity
    }

    return errors[0].error
  }

  return pendingTransfers
}

async function createAccountDeposit(
  deps: ServiceDependencies,
  args: Deposit,
  trx?: TransactionOrKnex
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
    getLiquidityAccount(deps, accountRef, trx),
    getSettlementAccount(deps, assetRef, trx)
  ])

  if (!account) {
    return TransferError.UnknownDestinationAccount
  }

  if (!settlementAccount) {
    return TransferError.UnknownSourceAccount
  }

  const transfer: CreateLedgerTransferArgs = {
    transferRef,
    debitAccount: settlementAccount,
    creditAccount: account,
    amount,
    type: LedgerTransferType.DEPOSIT
  }

  const { errors } = await createTransfers(deps, [transfer], trx)

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

  const transfer: CreateLedgerTransferArgs = {
    transferRef,
    debitAccount: account,
    creditAccount: settlementAccount,
    amount,
    type: LedgerTransferType.WITHDRAWAL,
    timeoutMs: timeout ? BigInt(timeout * 1000) : undefined
  }

  const { errors } = await createTransfers(deps, [transfer])

  if (errors[0]) {
    return errors[0].error
  }
}
