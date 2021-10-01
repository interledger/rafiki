import {
  Client,
  Commit,
  CommitFlags,
  CommitTransferError as CommitTransferErrorCode,
  CreateTransferError as CreateTransferErrorCode,
  Transfer as TbTransfer,
  TransferFlags
} from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'
import {
  CommitTransferError,
  CreateTransferError,
  TransfersError,
  TransferError
} from './errors'
import { BaseService } from '../shared/baseService'
import { uuidToBigInt } from '../shared/utils'

const TRANSFER_RESERVED = Buffer.alloc(32)

type Options = {
  id?: string
  sourceBalanceId: string
  destinationBalanceId: string
  amount: bigint
}

export type AutoCommitTransfer = Options & {
  timeout?: never
}

export type TwoPhaseTransfer = Required<Options> & {
  timeout?: bigint // nano-seconds
}

export type Transfer = AutoCommitTransfer | TwoPhaseTransfer

export interface TransferService {
  create(transfers: Transfer[]): Promise<void | TransfersError>
  commit(ids: string[]): Promise<void | TransfersError>
  rollback(ids: string[]): Promise<void | TransfersError>
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
): Promise<void | TransfersError> {
  const tbTransfers: TbTransfer[] = []
  for (let i = 0; i < transfers.length; i++) {
    const transfer = transfers[i]
    if (transfer.amount <= BigInt(0)) {
      return { index: i, error: TransferError.InvalidAmount }
    }
    let flags = 0
    if (transfer.timeout) {
      flags |= TransferFlags.two_phase_commit
    }
    if (i < transfers.length - 1) {
      flags |= TransferFlags.linked
    }
    tbTransfers.push({
      id: uuidToBigInt(transfers[i].id || uuid()),
      debit_account_id: uuidToBigInt(transfer.sourceBalanceId),
      credit_account_id: uuidToBigInt(transfer.destinationBalanceId),
      amount: transfer.amount,
      user_data: BigInt(0),
      reserved: TRANSFER_RESERVED,
      code: 0,
      flags,
      timeout: transfer.timeout || BigInt(0),
      timestamp: BigInt(0)
    })
  }
  const res = await deps.tigerbeetle.createTransfers(tbTransfers)
  for (const { index, code } of res) {
    switch (code) {
      case CreateTransferErrorCode.linked_event_failed:
        break
      case CreateTransferErrorCode.exists:
      case CreateTransferErrorCode.exists_with_different_debit_account_id:
      case CreateTransferErrorCode.exists_with_different_credit_account_id:
      case CreateTransferErrorCode.exists_with_different_user_data:
      case CreateTransferErrorCode.exists_with_different_reserved_field:
      case CreateTransferErrorCode.exists_with_different_code:
      case CreateTransferErrorCode.exists_with_different_amount:
      case CreateTransferErrorCode.exists_with_different_timeout:
      case CreateTransferErrorCode.exists_with_different_flags:
      case CreateTransferErrorCode.exists_and_already_committed_and_accepted:
      case CreateTransferErrorCode.exists_and_already_committed_and_rejected:
        return { index, error: TransferError.TransferExists }
      case CreateTransferErrorCode.accounts_are_the_same:
        return { index, error: TransferError.SameBalances }
      case CreateTransferErrorCode.debit_account_not_found:
        return { index, error: TransferError.UnknownSourceBalance }
      case CreateTransferErrorCode.credit_account_not_found:
        return { index, error: TransferError.UnknownDestinationBalance }
      case CreateTransferErrorCode.exceeds_credits:
        return { index, error: TransferError.InsufficientBalance }
      case CreateTransferErrorCode.exceeds_debits:
        return { index, error: TransferError.InsufficientDebitBalance }
      case CreateTransferErrorCode.accounts_have_different_units:
        return { index, error: TransferError.DifferentAssets }
      default:
        throw new CreateTransferError(code)
    }
  }
}

async function commitTransfers(
  deps: ServiceDependencies,
  transferIds: string[]
): Promise<void | TransfersError> {
  return await handleCommits({
    deps,
    commits: transferIds.map((id, idx) => {
      return {
        id: uuidToBigInt(id),
        flags: idx < transferIds.length - 1 ? 0 | CommitFlags.linked : 0,
        reserved: TRANSFER_RESERVED,
        code: 0,
        timestamp: BigInt(0)
      }
    })
  })
}

async function rollbackTransfers(
  deps: ServiceDependencies,
  transferIds: string[]
): Promise<void | TransfersError> {
  return await handleCommits({
    deps,
    commits: transferIds.map((id, idx) => {
      const flags = idx < transferIds.length - 1 ? 0 | CommitFlags.linked : 0
      return {
        id: uuidToBigInt(id),
        flags: flags | CommitFlags.reject,
        reserved: TRANSFER_RESERVED,
        code: 0,
        timestamp: BigInt(0)
      }
    }),
    reject: true
  })
}

async function handleCommits({
  deps,
  commits,
  reject
}: {
  deps: ServiceDependencies
  commits: Commit[]
  reject?: boolean
}): Promise<void | TransfersError> {
  const res = await deps.tigerbeetle.commitTransfers(commits)
  for (const { index, code } of res) {
    switch (code) {
      case CommitTransferErrorCode.linked_event_failed:
        break
      case CommitTransferErrorCode.transfer_not_found:
        return { index, error: TransferError.UnknownTransfer }
      case CommitTransferErrorCode.transfer_expired:
        return { index, error: TransferError.TransferExpired }
      case CommitTransferErrorCode.already_committed:
        return {
          index,
          error: reject
            ? TransferError.AlreadyRolledBack
            : TransferError.AlreadyCommitted
        }
      case CommitTransferErrorCode.transfer_not_two_phase_commit:
      case CommitTransferErrorCode.already_committed_but_accepted:
        return { index, error: TransferError.AlreadyCommitted }
      case CommitTransferErrorCode.already_committed_but_rejected:
        return { index, error: TransferError.AlreadyRolledBack }
      default:
        throw new CommitTransferError(code)
    }
  }
}
