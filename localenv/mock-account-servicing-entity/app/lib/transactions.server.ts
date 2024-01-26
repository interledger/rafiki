import { mockAccounts } from './accounts.server'
import { getWalletAddressPayments } from './requesters'

export interface Amount {
  value: bigint
  assetCode: string
  assetScale: number
}

export enum TransactionType {
  IncomingPayment = 'Incoming Payment',
  OutgoingPayment = 'Outgoing Payment'
}

interface Transaction {
  id: string
  metadata: Record<string, unknown>
  createdAt: string
  amountValue: string
  assetCode: string
  assetScale: number
  state: string
  type: TransactionType
}

export interface IncomingPayment extends Transaction {
  incomingAmountValue?: string
}

export interface OutgoingPayment extends Transaction {
  receiver: string
  sentAmountValue: string
  receiveAmount: Amount
}

export async function getAccountTransactions(
  accountId: string
): Promise<Array<IncomingPayment | OutgoingPayment>> {
  const account = await mockAccounts.get(accountId)

  if (!account?.walletAddressID) {
    return []
  }

  const { incomingPayments, outgoingPayments } = await getWalletAddressPayments(
    account.walletAddressID
  )

  const incomingPaymentEdges = incomingPayments?.edges || []
  const outgoingPaymentEdges = outgoingPayments?.edges || []

  const transactions: Array<IncomingPayment | OutgoingPayment> =
    incomingPaymentEdges.map(({ node }) => {
      return {
        id: node.id,
        metadata: node.metadata,
        incomingAmountValue: node.incomingAmount?.value?.toString(),
        amountValue: node.receivedAmount.value.toString(),
        assetCode: node.receivedAmount.assetCode,
        assetScale: node.receivedAmount.assetScale,
        state: node.state,
        createdAt: node.createdAt,
        type: TransactionType.IncomingPayment
      }
    })

  return transactions.concat(
    outgoingPaymentEdges.map(({ node }) => {
      return {
        id: node.id,
        receiver: node.receiver,
        metadata: node.metadata,
        sentAmountValue: node.sentAmount.value.toString(),
        amountValue: node.sentAmount.value.toString(),
        receiveAmount: node.receiveAmount,
        assetCode: node.sentAmount.assetCode,
        assetScale: node.sentAmount.assetScale,
        state: node.state,
        createdAt: node.createdAt,
        type: TransactionType.OutgoingPayment
      }
    })
  )
}
