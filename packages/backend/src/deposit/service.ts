import { v4 as uuid } from 'uuid'

import { DepositError } from './errors'
import { AccountService } from '../account/service'
import { AssetOptions, AssetService } from '../asset/service'
import { TransferService } from '../transfer/service'
import { TransferError } from '../transfer/errors'
import { BaseService } from '../shared/baseService'
import {
  BalanceTransferError,
  UnknownBalanceError,
  UnknownLiquidityAccountError,
  UnknownSettlementAccountError
} from '../shared/errors'
import { validateId } from '../shared/utils'

interface DepositOptions {
  id?: string
  amount: bigint
}

export interface AccountDeposit extends DepositOptions {
  accountId: string
}

export interface LiquidityDeposit extends DepositOptions {
  asset: AssetOptions
}

export type Deposit = Required<AccountDeposit> & {
  // createdTime: bigint
}

export interface DepositService {
  create(deposit: AccountDeposit): Promise<Deposit | DepositError>
  createLiquidity(deposit: LiquidityDeposit): Promise<void | DepositError>
  // get(id: string): Promise<void | DepositError>
}

interface ServiceDependencies extends BaseService {
  accountService: AccountService
  assetService: AssetService
  transferService: TransferService
}

export function createDepositService({
  logger,
  accountService,
  assetService,
  transferService
}: ServiceDependencies): DepositService {
  const log = logger.child({
    service: 'DepositService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    accountService,
    assetService,
    transferService
  }
  return {
    create: (options) => createDeposit(deps, options),
    createLiquidity: (options) => createLiquidityDeposit(deps, options)
    // get: (id) => getDeposit(deps, id)
  }
}

async function createDeposit(
  deps: ServiceDependencies,
  { id, accountId, amount }: AccountDeposit
): Promise<Deposit | DepositError> {
  if (id && !validateId(id)) {
    return DepositError.InvalidId
  }
  const account = await deps.accountService.get(accountId)
  if (!account) {
    return DepositError.UnknownAccount
  }
  const depositId = id || uuid()
  const error = await deps.transferService.create([
    {
      id: depositId,
      sourceBalanceId: account.asset.settlementBalanceId,
      destinationBalanceId: account.balanceId,
      amount
    }
  ])

  if (error) {
    switch (error.error) {
      // TODO: query transfer to check if it's a deposit
      case TransferError.TransferExists:
        return DepositError.DepositExists
      case TransferError.UnknownSourceBalance:
        throw new UnknownSettlementAccountError(account.asset)
      case TransferError.UnknownDestinationBalance:
        throw new UnknownBalanceError(accountId)
      default:
        throw new BalanceTransferError(error.error)
    }
  }
  return {
    id: depositId,
    accountId,
    amount
    // TODO: Get tigerbeetle transfer timestamp
    // createdTime
  }
}

async function createLiquidityDeposit(
  deps: ServiceDependencies,
  { asset: { code, scale }, amount, id }: LiquidityDeposit
): Promise<void | DepositError> {
  if (id && !validateId(id)) {
    return DepositError.InvalidId
  }
  const asset = await deps.assetService.getOrCreate({ code, scale })
  const error = await deps.transferService.create([
    {
      id: id || uuid(),
      sourceBalanceId: asset.settlementBalanceId,
      destinationBalanceId: asset.liquidityBalanceId,
      amount
    }
  ])
  if (error) {
    switch (error.error) {
      case TransferError.TransferExists:
        return DepositError.DepositExists
      case TransferError.UnknownSourceBalance:
        throw new UnknownSettlementAccountError(asset)
      case TransferError.UnknownDestinationBalance:
        throw new UnknownLiquidityAccountError(asset)
      default:
        throw new BalanceTransferError(error.error)
    }
  }
}
