import { Resolvers } from '../generated/graphql'
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
    outgoingPayment: getOutgoingPayment,
    paymentPointer: getPaymentPointer,
    peer: getPeer,
    peers: getPeers
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
  Mutation: {
    createOutgoingPayment,
    approveOutgoingPayment,
    requoteOutgoingPayment,
    cancelOutgoingPayment,
    createPaymentPointer,
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
