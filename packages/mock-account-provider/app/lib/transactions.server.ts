import { mockAccounts } from './accounts.server'
import { getPaymentPointerPayments } from './requesters'

export interface Amount {
  value: bigint
  assetCode: string
  assetScale: number
}

export type IncomingPayment = {
  id: string
  description: string
  externalRef: string
  incomingAmountValue: string
  receivedAmountValue: string
  assetCode: string
  assetScale: number
  state: string
  createdAt: string
}

export type OutgoingPayment = {
  id: string
  receiver: string
  description: string
  externalRef: string
  sendAmountValue: string
  sentAmountValue: string
  receiveAmount: Amount
  assetCode: string
  assetScale: number
  state: string
  createdAt: string
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
      receivedAmountValue: node.receivedAmount.value,
      assetCode: node.receivedAmount.assetCode,
      assetScale: node.receivedAmount.assetScale,
      state: node.state,
      createdAt: node.createdAt
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
        sentAmountValue: node.sentAmount.value,
        receiveAmount: node.receiveAmount,
        assetCode: node.sendAmount.assetCode,
        assetScale: node.sendAmount.assetScale,
        state: node.state,
        createdAt: node.createdAt
      }
    })
  )
}
