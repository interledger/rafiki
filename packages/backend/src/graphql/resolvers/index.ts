import { Resolvers } from '../generated/graphql'
import { getAccount, createAccount } from './account'
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
    outgoingPayment: getOutgoingPayment,
    peer: getPeer,
    peers: getPeers
  },
  Account: {
    invoices: getAccountInvoices,
    outgoingPayments: getAccountOutgoingPayments
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
  PeersConnection: {
    pageInfo: getPeersConnectionPageInfo
  },
  Mutation: {
    createAccount,
    createOutgoingPayment,
    approveOutgoingPayment,
    requoteOutgoingPayment,
    cancelOutgoingPayment,
    createPeer: createPeer,
    updatePeer: updatePeer,
    deletePeer: deletePeer,
    addAccountLiquidity: addAccountLiquidity,
    addAssetLiquidity: addAssetLiquidity,
    createAccountLiquidityWithdrawal: createAccountLiquidityWithdrawal,
    createAssetLiquidityWithdrawal: createAssetLiquidityWithdrawal,
    finalizeLiquidityWithdrawal: finalizeLiquidityWithdrawal,
    rollbackLiquidityWithdrawal: rollbackLiquidityWithdrawal
  }
}
