import {
  ResolversTypes,
  QueryResolvers,
  AccountingTransferEdge,
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
    const { filter, limit } = args

    const accountTransfers: GetLedgerTransfersResult =
      await accountingService.getAccountTransfers(
        `${filter.walletAddressId}`,
        limit
      )

    return {
      edgeDebits: accountTransfers.debits.map((debit) =>
        transferToGraphql(debit)
      ),
      edgeCredits: accountTransfers.credits.map((credit) =>
        transferToGraphql(credit)
      )
    }
  }

export function transferToGraphql(
  transfer: LedgerTransfer
): AccountingTransferEdge {
  return {
    node: {
      id: transfer.id,
      createdAt: new Date(Number(transfer.timestamp)).toISOString(),
      debitAccount: transfer.debitAccount,
      creditAccount: transfer.creditAccount,
      amount: transfer.amount,
      ledger: transfer.ledger,
      transferType: transferTypeToGraphql(transfer.transferType)
    }
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
