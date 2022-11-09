import { mockAccounts } from './accounts.server'
import { getPaymentPointerPayments } from './requesters'

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
  description: string
  externalRef: string
  createdAt: string
  amountValue: string
  assetCode: string
  assetScale: number
  state: string
  type: TransactionType
}

export interface IncomingPayment extends Transaction {
  incomingAmountValue: string
}

export interface OutgoingPayment extends Transaction {
  receiver: string
  sendAmountValue: string
  receiveAmount: Amount
}

export async function getAccountTransactions(
  accountId: string
): Promise<Array<IncomingPayment | OutgoingPayment>> {
  const account = await mockAccounts.get(accountId)
  const { incomingPayments, outgoingPayments } =
    await getPaymentPointerPayments(account.paymentPointerID)
  const transactions = incomingPayments.edges.map(({ node }) => {
    return {
      id: node.id,
      description: node.description,
      externalRef: node.externalRef,
      incomingAmountValue: node.incomingAmount.value,
      amountValue: node.receivedAmount.value,
      assetCode: node.receivedAmount.assetCode,
      assetScale: node.receivedAmount.assetScale,
      state: node.state,
      createdAt: node.createdAt,
      type: TransactionType.IncomingPayment
    }
  })
  return transactions.concat(
    outgoingPayments.edges.map(({ node }) => {
      return {
        id: node.id,
        receiver: node.receiver,
        description: node.description,
        externalRef: node.externalRef,
        sendAmountValue: node.sendAmount.value,
        amountValue: node.sentAmount.value,
        receiveAmount: node.receiveAmount,
        assetCode: node.sendAmount.assetCode,
        assetScale: node.sendAmount.assetScale,
        state: node.state,
        createdAt: node.createdAt,
        type: TransactionType.OutgoingPayment
      }
    })
  )
}
