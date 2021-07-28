import { Resolvers } from '../generated/graphql'
import { getAccount, getBalance } from './account'
import { getAccountInvoices, getPageInfo } from './invoice'

export const resolvers: Resolvers = {
  Query: {
    account: getAccount
  },
  Account: {
    balance: getBalance,
    invoices: getAccountInvoices
  },
  InvoiceConnection: {
    pageInfo: getPageInfo
  }
}
