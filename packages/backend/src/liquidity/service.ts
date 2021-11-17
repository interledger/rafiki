import { v4 as uuid } from 'uuid'

import { LiquidityError } from './errors'
import { AccountOptions, AssetAccount } from '../tigerbeetle/account/service'
import { TransferService } from '../tigerbeetle/transfer/service'
import { TransferError, TransfersError } from '../tigerbeetle/transfer/errors'
import { BaseService } from '../shared/baseService'
import { BalanceTransferError, UnknownAccountError } from '../shared/errors'
import { validateId } from '../shared/utils'

interface Options {
  id?: string
  // TODO: disallow balances and non-liquidity asset account
  account: AccountOptions
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
  const error = await deps.transferService.create([
    {
      id: id || uuid(),
      sourceAccount: {
        asset: {
          unit: account.asset.unit,
          account: AssetAccount.Settlement
        }
      },
      destinationAccount: account,
      amount
    }
  ])

  if (error) {
    switch (error.error) {
      case TransferError.TransferExists:
        return LiquidityError.TransferExists
      case TransferError.UnknownSourceBalance:
        throw new UnknownAccountError({
          asset: {
            unit: account.asset.unit,
            account: AssetAccount.Settlement
          }
        })
      case TransferError.UnknownDestinationBalance:
        throw new UnknownAccountError(account)
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
  const error = await deps.transferService.create([
    {
      id,
      sourceAccount: account,
      destinationAccount: {
        asset: {
          unit: account.asset.unit,
          account: AssetAccount.Settlement
        }
      },
      amount,
      timeout: BigInt(60e9) // 1 minute
    }
  ])

  if (error) {
    switch (error.error) {
      case TransferError.TransferExists:
        return LiquidityError.TransferExists
      case TransferError.UnknownSourceBalance:
        throw new UnknownAccountError(account)
      case TransferError.UnknownDestinationBalance:
        throw new UnknownAccountError({
          asset: {
            unit: account.asset.unit,
            account: AssetAccount.Settlement
          }
        })
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
