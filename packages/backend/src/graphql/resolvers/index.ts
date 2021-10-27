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
import { getPaymentPointerInvoices, getPageInfo } from './invoice'
import {
  getOutgoingPayment,
  createOutgoingPayment,
  approveOutgoingPayment,
  requoteOutgoingPayment,
  cancelOutgoingPayment,
  getOutcome,
  getPaymentPointerOutgoingPayments,
  getOutgoingPaymentPageInfo
} from './outgoing_payment'
import { getPaymentPointer, createPaymentPointer } from './payment_pointer'
import {
  getPeer,
  getPeers,
  getPeersConnectionPageInfo,
  createPeer,
  updatePeer,
  deletePeer
} from './peer'
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
    outgoingPayment: getOutgoingPayment,
    paymentPointer: getPaymentPointer,
    peer: getPeer,
    peers: getPeers
    // webhook: getWebhook
  },
  Account: {
    balance: getBalance
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
  PaymentPointer: {
    invoices: getPaymentPointerInvoices,
    outgoingPayments: getPaymentPointerOutgoingPayments
  },
  PeersConnection: {
    pageInfo: getPeersConnectionPageInfo
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
    createPaymentPointer,
    createPeer: createPeer,
    updatePeer: updatePeer,
    deletePeer: deletePeer,
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
