import {
  ResolversTypes,
  QueryResolvers,
  AccountingTransfer,
  TransferType as SchemaTransferType
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import {
  GetLedgerTransfersResult,
  LedgerTransfer,
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

    const accountTransfers = await accountingService.getAccountTransfers(id, limit)
    return {
      debits: accountTransfers.debits.map((debit) =>
        transferToGraphql(debit)
      ),
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
    debitAccount: transfer.debitAccount,
    creditAccount: transfer.creditAccount,
    amount: transfer.amount,
    ledger: transfer.ledger,
    transferType: transferTypeToGraphql(transfer.transferType)
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
      return SchemaTransferType.Default
  }
}
