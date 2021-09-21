import {
  Client,
  CommitFlags,
  CommitTransferError,
  CommitTransfersError,
  CreateTransferError,
  CreateTransfersError,
  TransferFlags
} from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'
import { BaseService } from '../shared/baseService'
import { uuidToBigInt } from '../shared/utils'

export {
  CreateTransferError,
  CreateTransfersError,
  CommitTransferError,
  CommitTransfersError
}

const TRANSFER_RESERVED = Buffer.alloc(32)

export interface Transfer {
  id?: string
  sourceBalanceId: string
  destinationBalanceId: string
  amount: bigint
  twoPhaseCommit?: boolean
}

export type TwoPhaseTransfer = Required<Transfer>

export interface TransferService {
  create(transfers: Transfer[]): Promise<void | CreateTransfersError>
  commit(ids: string[]): Promise<void | CommitTransfersError>
  rollback(ids: string[]): Promise<void | CommitTransfersError>
}

interface ServiceDependencies extends BaseService {
  tigerbeetle: Client
}

export async function createTransferService({
  logger,
  tigerbeetle
}: ServiceDependencies): Promise<TransferService> {
  const log = logger.child({
    service: 'TransferService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    tigerbeetle
  }
  return {
    create: (transfers) => createTransfers(deps, transfers),
    commit: (ids) => commitTransfers(deps, ids),
    rollback: (ids) => rollbackTransfers(deps, ids)
  }
}

async function createTransfers(
  deps: ServiceDependencies,
  transfers: Transfer[]
): Promise<void | CreateTransfersError> {
  const res = await deps.tigerbeetle.createTransfers(
    transfers.map((createTransfers, idx) => {
      let flags = 0
      if (createTransfers.twoPhaseCommit) {
        flags |= TransferFlags.two_phase_commit
      }
      if (idx < transfers.length - 1) {
        flags |= TransferFlags.linked
      }
      return {
        id: uuidToBigInt(createTransfers.id || uuid()),
        debit_account_id: uuidToBigInt(createTransfers.sourceBalanceId),
        credit_account_id: uuidToBigInt(createTransfers.destinationBalanceId),
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
  transferIds: string[]
): Promise<void | CommitTransfersError> {
  const res = await deps.tigerbeetle.commitTransfers(
    transferIds.map((id, idx) => {
      return {
        id: uuidToBigInt(id),
        flags: idx < transferIds.length - 1 ? 0 | CommitFlags.linked : 0,
        reserved: TRANSFER_RESERVED,
        code: 0,
        timestamp: BigInt(0)
      }
    })
  )
  for (const { index, code } of res) {
    switch (code) {
      case CommitTransferError.linked_event_failed:
        break
      default:
        return { index, code }
    }
  }
}

async function rollbackTransfers(
  deps: ServiceDependencies,
  transferIds: string[]
): Promise<void | CommitTransfersError> {
  const res = await deps.tigerbeetle.commitTransfers(
    transferIds.map((id, idx) => {
      const flags = idx < transferIds.length - 1 ? 0 | CommitFlags.linked : 0
      return {
        id: uuidToBigInt(id),
        flags: flags | CommitFlags.reject,
        reserved: TRANSFER_RESERVED,
        code: 0,
        timestamp: BigInt(0)
      }
    })
  )
  for (const { index, code } of res) {
    switch (code) {
      case CommitTransferError.linked_event_failed:
        break
      default:
        return { index, code }
    }
  }
}
