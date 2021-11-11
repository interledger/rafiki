import { v4 as uuid } from 'uuid'

import { LiquidityError } from './errors'
import { Account } from '../tigerbeetle/account/model'
import { TransferService } from '../tigerbeetle/transfer/service'
import { TransferError, TransfersError } from '../tigerbeetle/transfer/errors'
import { BaseService } from '../shared/baseService'
import {
  BalanceTransferError,
  UnknownAccountError,
  UnknownSettlementAccountError
} from '../shared/errors'
import { validateId } from '../shared/utils'

interface Options {
  id?: string
  account: Account
  amount: bigint
}

export type Withdrawal = Required<Options>

export interface LiquidityService {
  add(options: Options): Promise<void | LiquidityError>
  createWithdrawal(withdrawal: Withdrawal): Promise<void | LiquidityError>
  finalizeWithdrawal(id: string): Promise<void | LiquidityError>
  rollbackWithdrawal(id: string): Promise<void | LiquidityError>
}

interface ServiceDependencies extends BaseService {
  transferService: TransferService
}

export function createLiquidityService({
  logger,
  transferService
}: ServiceDependencies): LiquidityService {
  const log = logger.child({
    service: 'LiquidityService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    transferService
  }
  return {
    add: (options) => addLiquidity(deps, options),
    createWithdrawal: (withdrawal) =>
      createLiquidityWithdrawal(deps, withdrawal),
    finalizeWithdrawal: (id) => finalizeLiquidityWithdrawal(deps, id),
    rollbackWithdrawal: (id) => rollbackLiquidityWithdrawal(deps, id)
  }
}

async function addLiquidity(
  deps: ServiceDependencies,
  { id, account, amount }: Options
): Promise<void | LiquidityError> {
  if (id && !validateId(id)) {
    return LiquidityError.InvalidId
  }
  const settlementAccount = await account.asset.getSettlementAccount()
  const error = await deps.transferService.create([
    {
      id: id || uuid(),
      sourceBalanceId: settlementAccount.id,
      destinationBalanceId: account.id,
      amount
    }
  ])

  if (error) {
    switch (error.error) {
      case TransferError.TransferExists:
        return LiquidityError.TransferExists
      case TransferError.UnknownSourceBalance:
        throw new UnknownSettlementAccountError(account.asset)
      case TransferError.UnknownDestinationBalance:
        throw new UnknownAccountError(account.id)
      default:
        throw new BalanceTransferError(error.error)
    }
  }
}

async function createLiquidityWithdrawal(
  deps: ServiceDependencies,
  { id, account, amount }: Withdrawal
): Promise<void | LiquidityError> {
  if (!validateId(id)) {
    return LiquidityError.InvalidId
  }
  const settlementAccount = await account.asset.getSettlementAccount()
  const error = await deps.transferService.create([
    {
      id,
      sourceBalanceId: account.id,
      destinationBalanceId: settlementAccount.id,
      amount,
      timeout: BigInt(60e9) // 1 minute
    }
  ])

  if (error) {
    switch (error.error) {
      case TransferError.TransferExists:
        return LiquidityError.TransferExists
      case TransferError.UnknownSourceBalance:
        throw new UnknownAccountError(account.id)
      case TransferError.UnknownDestinationBalance:
        throw new UnknownSettlementAccountError(account.asset)
      case TransferError.InsufficientBalance:
        return LiquidityError.InsufficientBalance
      default:
        throw new BalanceTransferError(error.error)
    }
  }
}

async function finalizeLiquidityWithdrawal(
  deps: ServiceDependencies,
  id: string
): Promise<void | LiquidityError> {
  if (id && !validateId(id)) {
    return LiquidityError.InvalidId
  }
  // TODO: query transfer to verify it's a withdrawal
  const error = await deps.transferService.commit([id])

  if (error) {
    return toLiquidityError(error)
  }
}

async function rollbackLiquidityWithdrawal(
  deps: ServiceDependencies,
  id: string
): Promise<void | LiquidityError> {
  if (id && !validateId(id)) {
    return LiquidityError.InvalidId
  }
  // TODO: query transfer to verify it's a withdrawal
  const error = await deps.transferService.rollback([id])

  if (error) {
    return toLiquidityError(error)
  }
}

function toLiquidityError({ error }: TransfersError): LiquidityError {
  switch (error) {
    case TransferError.UnknownTransfer:
      return LiquidityError.UnknownWithdrawal
    case TransferError.AlreadyCommitted:
      return LiquidityError.AlreadyFinalized
    case TransferError.AlreadyRolledBack:
      return LiquidityError.AlreadyRolledBack
    default:
      throw new BalanceTransferError(error)
  }
}
