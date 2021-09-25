import { Resolvers } from '../generated/graphql'
import {
  getAccount,
  getAccounts,
  getAccountsConnectionPageInfo,
  getSubAccountsConnectionPageInfo,
  getBalance,
  getSuperAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  createSubAccount,
  getSubAccounts
} from './account'
import { createDeposit } from './deposit'
import { getAccountInvoices, getPageInfo } from './invoice'
import {
  getOutgoingPayment,
  createOutgoingPayment,
  approveOutgoingPayment,
  requoteOutgoingPayment,
  cancelOutgoingPayment,
  getOutcome
} from './outgoing_payment'
import { GraphQLBigInt } from '../scalars'

export const resolvers: Resolvers = {
  UInt64: GraphQLBigInt,
  Query: {
    account: getAccount,
    accounts: getAccounts,
    outgoingPayment: getOutgoingPayment
    // deposit: getDeposit,
    // webhook: getWebhook
  },
  Account: {
    balance: getBalance,
    invoices: getAccountInvoices,
    superAccount: getSuperAccount,
    subAccounts: getSubAccounts
    // deposits: getDeposits,
    // webhooks: getWebhooks,
  },
  AccountsConnection: {
    pageInfo: getAccountsConnectionPageInfo
  },
  DepositsConnection: {
    // pageInfo: getDepositsConnectionPageInfo
  },
  InvoiceConnection: {
    pageInfo: getPageInfo
  },
  OutgoingPayment: {
    outcome: getOutcome
  },
  SubAccountsConnection: {
    pageInfo: getSubAccountsConnectionPageInfo
  },
  WebhooksConnection: {
    // pageInfo: getWebhooksConnectionPageInfo
  },
  Mutation: {
    createAccount: createAccount,
    updateAccount: updateAccount,
    deleteAccount: deleteAccount,
    createSubAccount: createSubAccount,
    createOutgoingPayment,
    approveOutgoingPayment,
    requoteOutgoingPayment,
    cancelOutgoingPayment,
    // createWebhook: createWebhook,
    // updateWebhook: updateWebhook,
    // deleteWebhook: deleteWebhook,
    createDeposit: createDeposit
  }
}
