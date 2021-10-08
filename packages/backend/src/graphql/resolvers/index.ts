import { Resolvers } from '../generated/graphql'
import {
  getAccount,
  getAccounts,
  getAccountsConnectionPageInfo,
  getBalance,
  createAccount,
  updateAccount,
  deleteAccount
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
import {
  createWithdrawal,
  finalizePendingWithdrawal,
  rollbackPendingWithdrawal
} from './withdrawal'
import { GraphQLBigInt } from '../scalars'

export const resolvers: Resolvers = {
  UInt64: GraphQLBigInt,
  Query: {
    account: getAccount,
    accounts: getAccounts,
    outgoingPayment: getOutgoingPayment
    // deposit: getDeposit,
    // webhook: getWebhook
    // withdrawal: getWithdrawal
  },
  Account: {
    balance: getBalance,
    invoices: getAccountInvoices
    // deposits: getDeposits,
    // webhooks: getWebhooks,
    // withdrawals: getWithdrawals,
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
  WebhooksConnection: {
    // pageInfo: getWebhooksConnectionPageInfo
  },
  WithdrawalsConnection: {
    // pageInfo: getWithdrawalsConnectionPageInfo
  },
  Mutation: {
    createAccount: createAccount,
    updateAccount: updateAccount,
    deleteAccount: deleteAccount,
    createOutgoingPayment,
    approveOutgoingPayment,
    requoteOutgoingPayment,
    cancelOutgoingPayment,
    // createWebhook: createWebhook,
    // updateWebhook: updateWebhook,
    // deleteWebhook: deleteWebhook,
    createDeposit: createDeposit,
    createWithdrawal: createWithdrawal,
    finalizePendingWithdrawal: finalizePendingWithdrawal,
    rollbackPendingWithdrawal: rollbackPendingWithdrawal
  }
}
