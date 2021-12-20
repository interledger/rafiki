import { Resolvers } from '../generated/graphql'
import { getAccount, createAccount } from './account'
import { getAccountInvoices, getPageInfo } from './invoice'
import {
  getOutgoingPayment,
  createOutgoingPayment,
  requoteOutgoingPayment,
  fundOutgoingPayment,
  cancelOutgoingPayment,
  getOutcome,
  getAccountOutgoingPayments,
  getOutgoingPaymentPageInfo
} from './outgoing_payment'
import { createApiKey, deleteAllApiKeys, redeemApiKey } from './apiKey'
import {
  getPeer,
  getPeers,
  getPeersConnectionPageInfo,
  createPeer,
  updatePeer,
  deletePeer
} from './peer'
import {
  addAssetLiquidity,
  addPeerLiquidity,
  createAssetLiquidityWithdrawal,
  createPeerLiquidityWithdrawal,
  createInvoiceWithdrawal,
  createOutgoingPaymentWithdrawal,
  finalizeLiquidityWithdrawal,
  rollbackLiquidityWithdrawal
} from './liquidity'
import { GraphQLBigInt } from '../scalars'
import { refreshSession, revokeSession } from './session'

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
    requoteOutgoingPayment,
    fundOutgoingPayment,
    cancelOutgoingPayment,
    createApiKey: createApiKey,
    redeemApiKey: redeemApiKey,
    deleteAllApiKeys: deleteAllApiKeys,
    refreshSession: refreshSession,
    revokeSession: revokeSession,
    createPeer: createPeer,
    updatePeer: updatePeer,
    deletePeer: deletePeer,
    addAssetLiquidity: addAssetLiquidity,
    addPeerLiquidity: addPeerLiquidity,
    createAssetLiquidityWithdrawal: createAssetLiquidityWithdrawal,
    createPeerLiquidityWithdrawal: createPeerLiquidityWithdrawal,
    createInvoiceWithdrawal,
    createOutgoingPaymentWithdrawal,
    finalizeLiquidityWithdrawal: finalizeLiquidityWithdrawal,
    rollbackLiquidityWithdrawal: rollbackLiquidityWithdrawal
  }
}
