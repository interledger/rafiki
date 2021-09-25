import { v4 as uuid } from 'uuid'

import { AccountService } from '../account/service'
import { AssetOptions, AssetService } from '../asset/service'
import {
  TransferService,
  CommitTransferError,
  CreateTransferError
} from '../transfer/service'
import { BaseService } from '../shared/baseService'
import {
  BalanceTransferError,
  UnknownBalanceError,
  UnknownLiquidityAccountError,
  UnknownSettlementAccountError
} from '../shared/errors'
import { validateId } from '../shared/utils'

interface WithdrawalOptions {
  id?: string
  amount: bigint
}

export interface AccountWithdrawal extends WithdrawalOptions {
  accountId: string
}

export interface LiquidityWithdrawal extends WithdrawalOptions {
  asset: AssetOptions
}

export type Withdrawal = Required<AccountWithdrawal> & {
  // createdTime: bigint
  // finalizedTime: bigint
  // status: WithdrawalStatus
}

export enum WithdrawalError {
  AlreadyFinalized = 'AlreadyFinalized',
  AlreadyRolledBack = 'AlreadyRolledBack',
  InsufficientBalance = 'InsufficientBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InsufficientSettlementBalance = 'InsufficientSettlementBalance',
  InvalidId = 'InvalidId',
  UnknownAccount = 'UnknownAccount',
  UnknownAsset = 'UnknownAsset',
  UnknownWithdrawal = 'UnknownWithdrawal',
  WithdrawalExists = 'WithdrawalExists'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isWithdrawalError = (o: any): o is WithdrawalError =>
  Object.values(WithdrawalError).includes(o)

export interface WithdrawalService {
  create(withdrawal: AccountWithdrawal): Promise<Withdrawal | WithdrawalError>
  createLiquidity(
    withdrawal: LiquidityWithdrawal
  ): Promise<void | WithdrawalError>
  finalize(id: string): Promise<void | WithdrawalError>
  rollback(id: string): Promise<void | WithdrawalError>
  // get(id: string): Promise<void | WithdrawalError>
}

interface ServiceDependencies extends BaseService {
  accountService: AccountService
  assetService: AssetService
  transferService: TransferService
}

export function createWithdrawalService({
  logger,
  accountService,
  assetService,
  transferService
}: ServiceDependencies): WithdrawalService {
  const log = logger.child({
    service: 'WithdrawalService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    accountService,
    assetService,
    transferService
  }
  return {
    create: (options) => createWithdrawal(deps, options),
    createLiquidity: (options) => createLiquidityWithdrawal(deps, options),
    finalize: (id) => finalizeWithdrawal(deps, id),
    rollback: (id) => rollbackWithdrawal(deps, id)
    // get: (id) => getWithdrawal(deps, id)
  }
}

async function createWithdrawal(
  deps: ServiceDependencies,
  { id, accountId, amount }: AccountWithdrawal
): Promise<Withdrawal | WithdrawalError> {
  if (id && !validateId(id)) {
    return WithdrawalError.InvalidId
  }
  const account = await deps.accountService.get(accountId)
  if (!account) {
    return WithdrawalError.UnknownAccount
  }
  const withdrawalId = id || uuid()
  const error = await deps.transferService.create([
    {
      id: withdrawalId,
      sourceBalanceId: account.balanceId,
      destinationBalanceId: account.asset.settlementBalanceId,
      amount,
      twoPhaseCommit: true
    }
  ])

  if (error) {
    switch (error.code) {
      // TODO: query existing transfer to check if it's a withdrawal
      case CreateTransferError.exists:
        return WithdrawalError.WithdrawalExists
      case CreateTransferError.debit_account_not_found:
        throw new UnknownBalanceError(accountId)
      case CreateTransferError.credit_account_not_found:
        throw new UnknownSettlementAccountError(account.asset)
      case CreateTransferError.exceeds_credits:
        return WithdrawalError.InsufficientBalance
      case CreateTransferError.exceeds_debits:
        return WithdrawalError.InsufficientSettlementBalance
      default:
        throw new BalanceTransferError(error.code)
    }
  }
  return {
    id: withdrawalId,
    accountId,
    amount
    // TODO: Get tigerbeetle transfer timestamp
    // createdTime
  }
}

async function createLiquidityWithdrawal(
  deps: ServiceDependencies,
  { asset: { code, scale }, amount, id }: LiquidityWithdrawal
): Promise<void | WithdrawalError> {
  if (id && !validateId(id)) {
    return WithdrawalError.InvalidId
  }
  const asset = await deps.assetService.get({ code, scale })
  if (!asset) {
    return WithdrawalError.UnknownAsset
  }
  const error = await deps.transferService.create([
    {
      id: id || uuid(),
      sourceBalanceId: asset.liquidityBalanceId,
      destinationBalanceId: asset.settlementBalanceId,
      amount
    }
  ])
  if (error) {
    switch (error.code) {
      case CreateTransferError.exists:
        return WithdrawalError.WithdrawalExists
      case CreateTransferError.debit_account_not_found:
        throw new UnknownLiquidityAccountError(asset)
      case CreateTransferError.credit_account_not_found:
        throw new UnknownSettlementAccountError(asset)
      case CreateTransferError.exceeds_credits:
        return WithdrawalError.InsufficientLiquidity
      case CreateTransferError.exceeds_debits:
        return WithdrawalError.InsufficientSettlementBalance
      default:
        throw new BalanceTransferError(error.code)
    }
  }
}

async function finalizeWithdrawal(
  deps: ServiceDependencies,
  id: string
): Promise<void | WithdrawalError> {
  if (id && !validateId(id)) {
    return WithdrawalError.InvalidId
  }
  // TODO: query transfer to verify it's a withdrawal
  const error = await deps.transferService.commit([id])

  if (error) {
    switch (error.code) {
      case CommitTransferError.linked_event_failed:
        break
      case CommitTransferError.transfer_not_found:
        return WithdrawalError.UnknownWithdrawal
      case CommitTransferError.already_committed:
        return WithdrawalError.AlreadyFinalized
      case CommitTransferError.already_committed_but_rejected:
        return WithdrawalError.AlreadyRolledBack
      default:
        throw new BalanceTransferError(error.code)
    }
  }
}

async function rollbackWithdrawal(
  deps: ServiceDependencies,
  id: string
): Promise<void | WithdrawalError> {
  if (id && !validateId(id)) {
    return WithdrawalError.InvalidId
  }
  // TODO: query transfer to verify it's a withdrawal
  const error = await deps.transferService.rollback([id])

  if (error) {
    switch (error.code) {
      case CommitTransferError.linked_event_failed:
        break
      case CommitTransferError.transfer_not_found:
        return WithdrawalError.UnknownWithdrawal
      case CommitTransferError.already_committed_but_accepted:
        return WithdrawalError.AlreadyFinalized
      case CommitTransferError.already_committed:
        return WithdrawalError.AlreadyRolledBack
      default:
        throw new BalanceTransferError(error.code)
    }
  }
}
