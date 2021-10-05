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
import { extendCredit, revokeCredit, utilizeCredit, settleDebt } from './credit'
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
    invoices: getAccountInvoices,
    superAccount: getSuperAccount,
    subAccounts: getSubAccounts
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
  SubAccountsConnection: {
    pageInfo: getSubAccountsConnectionPageInfo
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
    createSubAccount: createSubAccount,
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
    rollbackPendingWithdrawal: rollbackPendingWithdrawal,
    extendCredit: extendCredit,
    revokeCredit: revokeCredit,
    utilizeCredit: utilizeCredit,
    settleDebt: settleDebt
  }
}
