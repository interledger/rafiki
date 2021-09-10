import {
  Account as Balance,
  AccountFlags,
  Client,
  CommitFlags,
  CommitTransferError,
  CommitTransfersError,
  CreateAccountError as CreateBalanceErr,
  CreateTransferError,
  CreateTransfersError,
  TransferFlags
} from 'tigerbeetle-node'
import { BaseService } from '../shared/baseService'
import { CreateBalanceError } from './errors'
import { randomId } from '../shared/utils'

export {
  Balance,
  CommitTransferError,
  CommitTransfersError,
  CreateTransferError
}

const ACCOUNT_RESERVED = Buffer.alloc(48)
const TRANSFER_RESERVED = Buffer.alloc(32)

export interface BalanceOptions {
  id: bigint
  debitBalance?: boolean
  unit: number
}

export interface BalanceTransfer {
  id?: bigint
  sourceBalanceId: bigint
  destinationBalanceId: bigint
  amount: bigint
  twoPhaseCommit?: boolean
}

export type TwoPhaseTransfer = Required<BalanceTransfer>

export interface BalanceService {
  create(balances: BalanceOptions[]): Promise<void>
  get(ids: bigint[]): Promise<Balance[]>
  createTransfers(
    transfers: BalanceTransfer[]
  ): Promise<void | CreateTransfersError>
  commitTransfers(transferIds: bigint[]): Promise<CommitTransfersError[]>
  rollbackTransfers(transferIds: bigint[]): Promise<CommitTransfersError[]>
}

interface ServiceDependencies extends BaseService {
  tbClient: Client
}

export function createBalanceService({
  logger,
  tbClient
}: ServiceDependencies): BalanceService {
  const log = logger.child({
    service: 'BalanceService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    tbClient
  }
  return {
    create: (balances) => createBalances(deps, balances),
    get: (ids) => getBalances(deps, ids),
    createTransfers: (transfers) => createTransfers(deps, transfers),
    commitTransfers: (transferIds) => commitTransfers(deps, transferIds),
    rollbackTransfers: (transferIds) => rollbackTransfers(deps, transferIds)
  }
}

async function createBalances(
  deps: ServiceDependencies,
  balances: BalanceOptions[]
): Promise<void> {
  const res = await deps.tbClient.createAccounts(
    balances.map(({ id, debitBalance, unit }, idx) => {
      let flags = 0
      if (debitBalance) {
        flags |= AccountFlags.credits_must_not_exceed_debits
      } else {
        flags |= AccountFlags.debits_must_not_exceed_credits
      }
      if (idx < balances.length - 1) {
        flags |= TransferFlags.linked
      }
      return {
        id,
        user_data: BigInt(0),
        reserved: ACCOUNT_RESERVED,
        unit,
        code: 0,
        flags,
        debits_accepted: BigInt(0),
        debits_reserved: BigInt(0),
        credits_accepted: BigInt(0),
        credits_reserved: BigInt(0),
        timestamp: 0n
      }
    })
  )
  for (const { code } of res) {
    if (code === CreateBalanceErr.linked_event_failed) {
      continue
    }
    throw new CreateBalanceError(code)
  }
}

async function getBalances(
  deps: ServiceDependencies,
  ids: bigint[]
): Promise<Balance[]> {
  return await deps.tbClient.lookupAccounts(ids)
}

async function createTransfers(
  deps: ServiceDependencies,
  transfers: BalanceTransfer[]
): Promise<void | CreateTransfersError> {
  const res = await deps.tbClient.createTransfers(
    transfers.map((createTransfers, idx) => {
      let flags = 0
      if (createTransfers.twoPhaseCommit) {
        flags |= TransferFlags.two_phase_commit
      }
      if (idx < transfers.length - 1) {
        flags |= TransferFlags.linked
      }
      return {
        id: createTransfers.id || randomId(),
        debit_account_id: createTransfers.sourceBalanceId,
        credit_account_id: createTransfers.destinationBalanceId,
        amount: createTransfers.amount,
        user_data: BigInt(0),
        reserved: TRANSFER_RESERVED,
        code: 0,
        flags,
        timeout: createTransfers.twoPhaseCommit ? BigInt(1e9) : BigInt(0),
        timestamp: BigInt(0)
      }
    })
  )
  for (const { index, code } of res) {
    switch (code) {
      case CreateTransferError.linked_event_failed:
        break
      case CreateTransferError.exists:
      case CreateTransferError.exists_with_different_debit_account_id:
      case CreateTransferError.exists_with_different_credit_account_id:
      case CreateTransferError.exists_with_different_user_data:
      case CreateTransferError.exists_with_different_reserved_field:
      case CreateTransferError.exists_with_different_code:
      case CreateTransferError.exists_with_different_amount:
      case CreateTransferError.exists_with_different_timeout:
      case CreateTransferError.exists_with_different_flags:
      case CreateTransferError.exists_and_already_committed_and_accepted:
      case CreateTransferError.exists_and_already_committed_and_rejected:
        return { index, code: CreateTransferError.exists }
      default:
        return { index, code }
    }
  }
}

async function commitTransfers(
  deps: ServiceDependencies,
  transferIds: bigint[]
): Promise<CommitTransfersError[]> {
  return await deps.tbClient.commitTransfers(
    transferIds.map((id, idx) => {
      return {
        id,
        flags: idx < transferIds.length - 1 ? 0 | CommitFlags.linked : 0,
        reserved: TRANSFER_RESERVED,
        code: 0,
        timestamp: BigInt(0)
      }
    })
  )
}

async function rollbackTransfers(
  deps: ServiceDependencies,
  transferIds: bigint[]
): Promise<CommitTransfersError[]> {
  return await deps.tbClient.commitTransfers(
    transferIds.map((id, idx) => {
      const flags = idx < transferIds.length - 1 ? 0 | CommitFlags.linked : 0
      return {
        id,
        flags: flags | CommitFlags.reject,
        reserved: TRANSFER_RESERVED,
        code: 0,
        timestamp: BigInt(0)
      }
    })
  )
}
