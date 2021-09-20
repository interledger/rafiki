import { Resolvers } from '../generated/graphql'
import { getAccount, getBalance } from './account'
import { getAccountInvoices, getPageInfo } from './invoice'
import {
  getOutgoingPayment,
  createOutgoingPayment,
  approveOutgoingPayment,
  requoteOutgoingPayment,
  cancelOutgoingPayment,
  getOutcome
} from './outgoing_payment'

export const resolvers: Resolvers = {
  Query: {
    account: getAccount,
    outgoingPayment: getOutgoingPayment
  },
  Mutation: {
    createOutgoingPayment,
    approveOutgoingPayment,
    requoteOutgoingPayment,
    cancelOutgoingPayment
  },
  Account: {
    balance: getBalance,
    invoices: getAccountInvoices
  },
  InvoiceConnection: {
    pageInfo: getPageInfo
  },
  OutgoingPayment: {
    outcome: getOutcome
  }
}
