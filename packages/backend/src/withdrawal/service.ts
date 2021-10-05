import { v4 as uuid } from 'uuid'

import { WithdrawalError } from './errors'
import { AccountService } from '../account/service'
import { AssetOptions, AssetService } from '../asset/service'
import { TransferService } from '../transfer/service'
import { TransferError, TransfersError } from '../transfer/errors'
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
      timeout: BigInt(60e9) // 1 minute
    }
  ])

  if (error) {
    switch (error.error) {
      // TODO: query existing transfer to check if it's a withdrawal
      case TransferError.TransferExists:
        return WithdrawalError.WithdrawalExists
      case TransferError.UnknownSourceBalance:
        throw new UnknownBalanceError(accountId)
      case TransferError.UnknownDestinationBalance:
        throw new UnknownSettlementAccountError(account.asset)
      case TransferError.InsufficientBalance:
        return WithdrawalError.InsufficientBalance
      default:
        throw new BalanceTransferError(error.error)
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
    switch (error.error) {
      case TransferError.TransferExists:
        return WithdrawalError.WithdrawalExists
      case TransferError.UnknownSourceBalance:
        throw new UnknownLiquidityAccountError(asset)
      case TransferError.UnknownDestinationBalance:
        throw new UnknownSettlementAccountError(asset)
      case TransferError.InsufficientBalance:
        return WithdrawalError.InsufficientLiquidity
      default:
        throw new BalanceTransferError(error.error)
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
    return toWithdrawalError(error)
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
    return toWithdrawalError(error)
  }
}

function toWithdrawalError({ error }: TransfersError): WithdrawalError {
  switch (error) {
    case TransferError.UnknownTransfer:
      return WithdrawalError.UnknownWithdrawal
    case TransferError.AlreadyCommitted:
      return WithdrawalError.AlreadyFinalized
    case TransferError.AlreadyRolledBack:
      return WithdrawalError.AlreadyRolledBack
    default:
      throw new BalanceTransferError(error)
  }
}
