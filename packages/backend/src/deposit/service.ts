import { v4 as uuid } from 'uuid'

import { AccountService } from '../account/service'
import { AssetOptions, AssetService } from '../asset/service'
import { TransferService, CreateTransferError } from '../transfer/service'
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

export enum DepositError {
  DepositExists = 'DepositExists',
  InvalidId = 'InvalidId',
  UnknownAccount = 'UnknownAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isDepositError = (o: any): o is DepositError =>
  Object.values(DepositError).includes(o)

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
    switch (error.code) {
      // TODO: query transfer to check if it's a deposit
      case CreateTransferError.exists:
        return DepositError.DepositExists
      case CreateTransferError.debit_account_not_found:
        throw new UnknownSettlementAccountError(account.asset)
      case CreateTransferError.credit_account_not_found:
        throw new UnknownBalanceError(accountId)
      default:
        throw new BalanceTransferError(error.code)
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
    switch (error.code) {
      case CreateTransferError.exists:
        return DepositError.DepositExists
      case CreateTransferError.debit_account_not_found:
        throw new UnknownSettlementAccountError(asset)
      case CreateTransferError.credit_account_not_found:
        throw new UnknownLiquidityAccountError(asset)
      default:
        throw new BalanceTransferError(error.code)
    }
  }
}
