import {
  ResolversTypes,
  QueryResolvers,
  AccountingTransfer,
  TransferType as SchemaTransferType,
  TransferState
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import {
  LedgerTransfer,
  LedgerTransferState,
  TransferType
} from '../../accounting/service'

export const getAccountingTransfers: QueryResolvers<ApolloContext>['accountingTransfers'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['AccountingTransferConnection']> => {
    const accountingService = await ctx.container.use('accountingService')
    const { id, limit } = args
    const accountTransfers = await accountingService.getAccountTransfers(
      isNaN(Number(id)) ? id : Number(id),
      limit
    )
    return {
      debits: accountTransfers.debits.map((debit) => transferToGraphql(debit)),
      credits: accountTransfers.credits.map((credit) =>
        transferToGraphql(credit)
      )
    }
  }

export function transferToGraphql(
  transfer: LedgerTransfer
): AccountingTransfer {
  return {
    id: transfer.id,
    createdAt: new Date(Number(transfer.timestamp)).toISOString(),
    debitAccountId: transfer.debitAccountId,
    creditAccountId: transfer.creditAccountId,
    amount: transfer.amount,
    ledger: transfer.ledger,
    transferType: transferTypeToGraphql(transfer.type),
    state: transferStateToGraphql(transfer.state),
    expiresAt: transfer.expiresAt
      ? new Date(transfer.expiresAt).toISOString()
      : undefined
  }
}

function transferTypeToGraphql(type: TransferType): SchemaTransferType {
  switch (type) {
    case TransferType.TRANSFER:
      return SchemaTransferType.Transfer
    case TransferType.DEPOSIT:
      return SchemaTransferType.Deposit
    case TransferType.WITHDRAWAL:
      return SchemaTransferType.Withdrawal
    default:
      throw new Error(`Transfer type '${type}' is not mapped!`)
  }
}

function transferStateToGraphql(state: LedgerTransferState): TransferState {
  switch (state) {
    case LedgerTransferState.PENDING:
      return TransferState.Pending
    case LedgerTransferState.POSTED:
      return TransferState.Posted
    case LedgerTransferState.VOIDED:
      return TransferState.Voided
    default:
      throw new Error(`Transfer state '${state}' is not mapped!`)
  }
}
