import { Resolvers } from '../generated/graphql'
import {
  getPaymentPointer,
  createPaymentPointer,
  triggerPaymentPointerEvents
} from './payment_pointer'
import {
  getAsset,
  getAssets,
  createAsset,
  updateAssetWithdrawalThreshold
} from './asset'
import {
  getPaymentPointerIncomingPayments,
  createIncomingPayment
} from './incoming_payment'
import { getQuote, createQuote, getPaymentPointerQuotes } from './quote'
import {
  getOutgoingPayment,
  createOutgoingPayment,
  getPaymentPointerOutgoingPayments
} from './outgoing_payment'
import { getPeer, getPeers, createPeer, updatePeer, deletePeer } from './peer'
import {
  addAssetLiquidity,
  addPeerLiquidity,
  createAssetLiquidityWithdrawal,
  createPeerLiquidityWithdrawal,
  createPaymentPointerWithdrawal,
  finalizeLiquidityWithdrawal,
  voidLiquidityWithdrawal,
  depositEventLiquidity,
  withdrawEventLiquidity
} from './liquidity'
import { GraphQLBigInt } from '../scalars'
import {
  createPaymentPointerKey,
  revokePaymentPointerKey
} from './paymentPointerKey'

export const resolvers: Resolvers = {
  UInt64: GraphQLBigInt,
  Query: {
    paymentPointer: getPaymentPointer,
    asset: getAsset,
    assets: getAssets,
    outgoingPayment: getOutgoingPayment,
    peer: getPeer,
    peers: getPeers,
    quote: getQuote
  },
  PaymentPointer: {
    incomingPayments: getPaymentPointerIncomingPayments,
    outgoingPayments: getPaymentPointerOutgoingPayments,
    quotes: getPaymentPointerQuotes
  },
  Mutation: {
    createPaymentPointerKey,
    revokePaymentPointerKey,
    createPaymentPointer,
    triggerPaymentPointerEvents,
    createAsset,
    updateAssetWithdrawalThreshold,
    createQuote,
    createOutgoingPayment,
    createIncomingPayment,
    createPeer: createPeer,
    updatePeer: updatePeer,
    deletePeer: deletePeer,
    addAssetLiquidity: addAssetLiquidity,
    addPeerLiquidity: addPeerLiquidity,
    createAssetLiquidityWithdrawal: createAssetLiquidityWithdrawal,
    createPeerLiquidityWithdrawal: createPeerLiquidityWithdrawal,
    createPaymentPointerWithdrawal,
    finalizeLiquidityWithdrawal: finalizeLiquidityWithdrawal,
    voidLiquidityWithdrawal: voidLiquidityWithdrawal,
    depositEventLiquidity,
    withdrawEventLiquidity
  }
}
