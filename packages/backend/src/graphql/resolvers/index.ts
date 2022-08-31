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
import { getPaymentPointerIncomingPayments } from './incoming_payment'
import { getQuote, createQuote, getPaymentPointerQuotes } from './quote'
import {
  getOutgoingPayment,
  createOutgoingPayment,
  getPaymentPointerOutgoingPayments
} from './outgoing_payment'
import { createApiKey, deleteAllApiKeys, redeemApiKey } from './apiKey'
import { getPeer, getPeers, createPeer, updatePeer, deletePeer } from './peer'
import {
  addAssetLiquidity,
  addPeerLiquidity,
  createAssetLiquidityWithdrawal,
  createPeerLiquidityWithdrawal,
  createPaymentPointerWithdrawal,
  finalizeLiquidityWithdrawal,
  rollbackLiquidityWithdrawal,
  depositEventLiquidity,
  withdrawEventLiquidity
} from './liquidity'
import { GraphQLBigInt } from '../scalars'
import { refreshSession, revokeSession } from './session'
import {
  addKeyToClient,
  createClient,
  getClient,
  revokeClientKey
} from './clientKeys'

export const resolvers: Resolvers = {
  UInt64: GraphQLBigInt,
  Query: {
    paymentPointer: getPaymentPointer,
    asset: getAsset,
    assets: getAssets,
    outgoingPayment: getOutgoingPayment,
    peer: getPeer,
    peers: getPeers,
    quote: getQuote,
    client: getClient
  },
  PaymentPointer: {
    incomingPayments: getPaymentPointerIncomingPayments,
    outgoingPayments: getPaymentPointerOutgoingPayments,
    quotes: getPaymentPointerQuotes
  },
  Mutation: {
    createClient,
    revokeClientKey,
    addKeyToClient,
    createPaymentPointer,
    triggerPaymentPointerEvents,
    createAsset,
    updateAssetWithdrawalThreshold,
    createQuote,
    createOutgoingPayment,
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
    createPaymentPointerWithdrawal,
    finalizeLiquidityWithdrawal: finalizeLiquidityWithdrawal,
    rollbackLiquidityWithdrawal: rollbackLiquidityWithdrawal,
    depositEventLiquidity,
    withdrawEventLiquidity
  }
}
