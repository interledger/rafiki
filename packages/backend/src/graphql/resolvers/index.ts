import { Resolvers } from '../generated/graphql'
import {
  getWalletAddress,
  getWalletAddresses,
  createWalletAddress,
  updateWalletAddress,
  triggerWalletAddressEvents
} from './wallet_address'
import {
  getAsset,
  getAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetReceivingFee,
  getAssetSendingFee,
  getFees
} from './asset'
import {
  getWalletAddressIncomingPayments,
  createIncomingPayment,
  getIncomingPayment
} from './incoming_payment'
import { getQuote, createQuote, getWalletAddressQuotes } from './quote'
import {
  getOutgoingPayment,
  createOutgoingPayment,
  getWalletAddressOutgoingPayments,
  createOutgoingPaymentFromIncomingPayment,
  cancelOutgoingPayment
} from './outgoing_payment'
import { getPeer, getPeers, createPeer, updatePeer, deletePeer } from './peer'
import {
  getAssetLiquidity,
  getPeerLiquidity,
  getWalletAddressLiquidity,
  getIncomingPaymentLiquidity,
  getOutgoingPaymentLiquidity,
  getPaymentLiquidity,
  depositAssetLiquidity,
  depositPeerLiquidity,
  createAssetLiquidityWithdrawal,
  createPeerLiquidityWithdrawal,
  createWalletAddressWithdrawal,
  postLiquidityWithdrawal,
  voidLiquidityWithdrawal,
  depositEventLiquidity,
  withdrawEventLiquidity,
  depositOutgoingPaymentLiquidity,
  createIncomingPaymentWithdrawal,
  createOutgoingPaymentWithdrawal
} from './liquidity'
import { GraphQLBigInt, GraphQLUInt8 } from '../scalars'
import {
  createWalletAddressKey,
  getWalletAddressKeys,
  revokeWalletAddressKey
} from './walletAddressKey'
import { getWalletAddressAdditionalProperties } from './walletAddressAdditionalProperties'
import { createReceiver, getReceiver } from './receiver'
import { getWebhookEvents } from './webhooks'
import { setFee } from './fee'
import { GraphQLJSONObject } from 'graphql-scalars'
import { getCombinedPayments } from './combined_payments'
import { createOrUpdatePeerByUrl } from './auto-peering'

export const resolvers: Resolvers = {
  UInt8: GraphQLUInt8,
  UInt64: GraphQLBigInt,
  JSONObject: GraphQLJSONObject,
  Asset: {
    liquidity: getAssetLiquidity,
    sendingFee: getAssetSendingFee,
    receivingFee: getAssetReceivingFee,
    fees: getFees
  },
  Peer: {
    liquidity: getPeerLiquidity
  },
  Query: {
    walletAddress: getWalletAddress,
    walletAddresses: getWalletAddresses,
    asset: getAsset,
    assets: getAssets,
    outgoingPayment: getOutgoingPayment,
    incomingPayment: getIncomingPayment,
    peer: getPeer,
    peers: getPeers,
    quote: getQuote,
    webhookEvents: getWebhookEvents,
    payments: getCombinedPayments,
    receiver: getReceiver
  },
  WalletAddress: {
    liquidity: getWalletAddressLiquidity,
    incomingPayments: getWalletAddressIncomingPayments,
    outgoingPayments: getWalletAddressOutgoingPayments,
    quotes: getWalletAddressQuotes,
    walletAddressKeys: getWalletAddressKeys,
    additionalProperties: getWalletAddressAdditionalProperties
  },
  IncomingPayment: {
    liquidity: getIncomingPaymentLiquidity
  },
  OutgoingPayment: {
    liquidity: getOutgoingPaymentLiquidity
  },
  Payment: {
    liquidity: getPaymentLiquidity
  },
  Mutation: {
    createWalletAddressKey,
    revokeWalletAddressKey,
    createWalletAddress,
    updateWalletAddress,
    triggerWalletAddressEvents,
    createAsset,
    updateAsset: updateAsset,
    deleteAsset,
    createQuote,
    createOutgoingPayment,
    createOutgoingPaymentFromIncomingPayment,
    cancelOutgoingPayment,
    createIncomingPayment,
    createReceiver,
    createPeer: createPeer,
    createOrUpdatePeerByUrl: createOrUpdatePeerByUrl,
    updatePeer: updatePeer,
    deletePeer: deletePeer,
    depositAssetLiquidity,
    depositPeerLiquidity,
    createAssetLiquidityWithdrawal: createAssetLiquidityWithdrawal,
    createPeerLiquidityWithdrawal: createPeerLiquidityWithdrawal,
    createWalletAddressWithdrawal,
    postLiquidityWithdrawal: postLiquidityWithdrawal,
    voidLiquidityWithdrawal: voidLiquidityWithdrawal,
    depositEventLiquidity,
    withdrawEventLiquidity,
    depositOutgoingPaymentLiquidity,
    createIncomingPaymentWithdrawal,
    createOutgoingPaymentWithdrawal,
    setFee
  }
}
