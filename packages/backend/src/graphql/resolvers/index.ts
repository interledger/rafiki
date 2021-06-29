import { Resolvers } from '../generated/graphql'
import { getUser, getAccount, getBalance } from './user'
import {
  getUserInvoices,
  getInvoiceEdges,
  getPageInfo,
  getInvoiceEdgeNode,
  getInvoiceItems
} from './invoice'

export const resolvers: Resolvers = {
  Query: {
    user: getUser
  },
  User: {
    account: getAccount,
    invoices: getUserInvoices
  },
  Account: {
    balance: getBalance
  },
  InvoiceConnection: {
    edges: getInvoiceEdges,
    pageInfo: getPageInfo
  },
  InvoiceEdge: {
    node: getInvoiceEdgeNode
  },
  Invoice: {
    items: getInvoiceItems
  }
}
