import { Resolvers } from '../generated/graphql'
import {
  getPaymentPointer,
  getPaymentPointers,
  createPaymentPointer,
  updatePaymentPointer,
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
  createIncomingPayment,
  getIncomingPayment
} from './incoming_payment'
import { getQuote, createQuote, getPaymentPointerQuotes } from './quote'
import {
  getOutgoingPayment,
  createOutgoingPayment,
  getPaymentPointerOutgoingPayments
} from './outgoing_payment'
import { getPeer, getPeers, createPeer, updatePeer, deletePeer } from './peer'
import {
  getAssetLiquidity,
  getPeerLiquidity,
  addAssetLiquidity,
  addPeerLiquidity,
  createAssetLiquidityWithdrawal,
  createPeerLiquidityWithdrawal,
  createPaymentPointerWithdrawal,
  postLiquidityWithdrawal,
  voidLiquidityWithdrawal,
  depositEventLiquidity,
  withdrawEventLiquidity
} from './liquidity'
import { GraphQLBigInt, GraphQLUInt8 } from '../scalars'
import {
  createPaymentPointerKey,
  revokePaymentPointerKey
} from './paymentPointerKey'
import { createReceiver } from './receiver'
import { getWebhookEvents } from './webhooks'
import { GraphQLJSONObject } from 'graphql-scalars'

export const resolvers: Resolvers = {
  UInt8: GraphQLUInt8,
  UInt64: GraphQLBigInt,
  JSONObject: GraphQLJSONObject,
  Asset: {
    liquidity: getAssetLiquidity
  },
  Peer: {
    liquidity: getPeerLiquidity
  },
  Query: {
    paymentPointer: getPaymentPointer,
    paymentPointers: getPaymentPointers,
    asset: getAsset,
    assets: getAssets,
    outgoingPayment: getOutgoingPayment,
    incomingPayment: getIncomingPayment,
    peer: getPeer,
    peers: getPeers,
    quote: getQuote,
    webhookEvents: getWebhookEvents
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
    updatePaymentPointer,
    triggerPaymentPointerEvents,
    createAsset,
    updateAssetWithdrawalThreshold,
    createQuote,
    createOutgoingPayment,
    createIncomingPayment,
    createReceiver,
    createPeer: createPeer,
    updatePeer: updatePeer,
    deletePeer: deletePeer,
    addAssetLiquidity: addAssetLiquidity,
    addPeerLiquidity: addPeerLiquidity,
    createAssetLiquidityWithdrawal: createAssetLiquidityWithdrawal,
    createPeerLiquidityWithdrawal: createPeerLiquidityWithdrawal,
    createPaymentPointerWithdrawal,
    postLiquidityWithdrawal: postLiquidityWithdrawal,
    voidLiquidityWithdrawal: voidLiquidityWithdrawal,
    depositEventLiquidity,
    withdrawEventLiquidity
  }
}
