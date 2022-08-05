import { Resolvers } from '../generated/graphql'
import { getAccount, createAccount, triggerAccountEvents } from './account'
import {
  getAsset,
  getAssets,
  createAsset,
  updateAssetWithdrawalThreshold
} from './asset'
import { getEvents, getEventResolveType } from './event'
import { getAccountIncomingPayments } from './incoming_payment'
import { getQuote, createQuote, getAccountQuotes } from './quote'
import {
  getOutgoingPayment,
  createOutgoingPayment,
  getAccountOutgoingPayments
} from './outgoing_payment'
import { createApiKey, deleteAllApiKeys, redeemApiKey } from './apiKey'
import { getPeer, getPeers, createPeer, updatePeer, deletePeer } from './peer'
import {
  addAssetLiquidity,
  addPeerLiquidity,
  createAssetLiquidityWithdrawal,
  createPeerLiquidityWithdrawal,
  createAccountWithdrawal,
  finalizeLiquidityWithdrawal,
  rollbackLiquidityWithdrawal,
  depositEventLiquidity,
  withdrawEventLiquidity
} from './liquidity'
import { GraphQLBigInt } from '../scalars'
import { refreshSession, revokeSession } from './session'

export const resolvers: Resolvers = {
  UInt64: GraphQLBigInt,
  Query: {
    account: getAccount,
    asset: getAsset,
    assets: getAssets,
    events: getEvents,
    outgoingPayment: getOutgoingPayment,
    peer: getPeer,
    peers: getPeers,
    quote: getQuote
  },
  Account: {
    incomingPayments: getAccountIncomingPayments,
    outgoingPayments: getAccountOutgoingPayments,
    quotes: getAccountQuotes
  },
  Event: {
    __resolveType: getEventResolveType
  },
  Mutation: {
    createAccount,
    triggerAccountEvents,
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
    createAccountWithdrawal,
    finalizeLiquidityWithdrawal: finalizeLiquidityWithdrawal,
    rollbackLiquidityWithdrawal: rollbackLiquidityWithdrawal,
    depositEventLiquidity,
    withdrawEventLiquidity
  }
}
