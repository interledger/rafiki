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
import { getAccountInvoices, getPageInfo } from './invoice'
import {
  getOutgoingPayment,
  createOutgoingPayment,
  approveOutgoingPayment,
  requoteOutgoingPayment,
  cancelOutgoingPayment,
  getOutcome,
  getAccountOutgoingPayments,
  getOutgoingPaymentPageInfo
} from './outgoing_payment'
import {
  addAccountLiquidity,
  addAssetLiquidity,
  createAccountLiquidityWithdrawal,
  createAssetLiquidityWithdrawal,
  finalizeLiquidityWithdrawal,
  rollbackLiquidityWithdrawal
} from './liquidity'
import { GraphQLBigInt } from '../scalars'

export const resolvers: Resolvers = {
  UInt64: GraphQLBigInt,
  Query: {
    account: getAccount,
    accounts: getAccounts,
    outgoingPayment: getOutgoingPayment
    // webhook: getWebhook
  },
  Account: {
    balance: getBalance,
    invoices: getAccountInvoices,
    outgoingPayments: getAccountOutgoingPayments
    // webhooks: getWebhooks,
  },
  AccountsConnection: {
    pageInfo: getAccountsConnectionPageInfo
  },
  InvoiceConnection: {
    pageInfo: getPageInfo
  },
  OutgoingPaymentConnection: {
    pageInfo: getOutgoingPaymentPageInfo
  },
  OutgoingPayment: {
    outcome: getOutcome
  },
  WebhooksConnection: {
    // pageInfo: getWebhooksConnectionPageInfo
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
    addAccountLiquidity: addAccountLiquidity,
    addAssetLiquidity: addAssetLiquidity,
    createAccountLiquidityWithdrawal: createAccountLiquidityWithdrawal,
    createAssetLiquidityWithdrawal: createAssetLiquidityWithdrawal,
    finalizeLiquidityWithdrawal: finalizeLiquidityWithdrawal,
    rollbackLiquidityWithdrawal: rollbackLiquidityWithdrawal
  }
}
