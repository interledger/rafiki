import { Resolvers } from '../generated/graphql'
import {
  getWalletAddress,
  getWalletAddresses,
  createWalletAddress,
  updateWalletAddress,
  triggerWalletAddressEvents,
  getWalletAddressByUrl,
  getWalletAddressTenant
} from './wallet_address'
import {
  getAsset,
  getAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetReceivingFee,
  getAssetSendingFee,
  getFees,
  getAssetByCodeAndScale,
  getAssetTenant
} from './asset'
import {
  getWalletAddressIncomingPayments,
  createIncomingPayment,
  getIncomingPayment,
  updateIncomingPayment,
  approveIncomingPayment,
  cancelIncomingPayment
} from './incoming_payment'
import { getQuote, createQuote, getWalletAddressQuotes } from './quote'
import {
  getOutgoingPayment,
  getOutgoingPayments,
  createOutgoingPayment,
  getWalletAddressOutgoingPayments,
  createOutgoingPaymentFromIncomingPayment,
  cancelOutgoingPayment
} from './outgoing_payment'
import {
  getPeer,
  getPeers,
  createPeer,
  updatePeer,
  deletePeer,
  getPeerByAddressAndAsset,
  getPeerTenant
} from './peer'
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
import { getWebhookEvents, getWebhookEventTenant } from './webhooks'
import { setFee } from './fee'
import { GraphQLJSONObject } from 'graphql-scalars'
import { getCombinedPayments, getPaymentTenant } from './combined_payments'
import { createOrUpdatePeerByUrl } from './auto-peering'
import { getAccountingTransfers } from './accounting_transfer'
import {
  whoami,
  createTenant,
  updateTenant,
  deleteTenant,
  getTenant,
  getTenants
} from './tenant'
import { createTenantSettings, getTenantSettings } from './tenant_settings'

export const resolvers: Resolvers = {
  UInt8: GraphQLUInt8,
  UInt64: GraphQLBigInt,
  JSONObject: GraphQLJSONObject,
  Asset: {
    liquidity: getAssetLiquidity,
    sendingFee: getAssetSendingFee,
    receivingFee: getAssetReceivingFee,
    fees: getFees,
    tenant: getAssetTenant
  },
  Peer: {
    liquidity: getPeerLiquidity,
    tenant: getPeerTenant
  },
  Query: {
    whoami,
    walletAddress: getWalletAddress,
    walletAddressByUrl: getWalletAddressByUrl,
    walletAddresses: getWalletAddresses,
    asset: getAsset,
    assets: getAssets,
    assetByCodeAndScale: getAssetByCodeAndScale,
    outgoingPayment: getOutgoingPayment,
    outgoingPayments: getOutgoingPayments,
    incomingPayment: getIncomingPayment,
    peer: getPeer,
    peerByAddressAndAsset: getPeerByAddressAndAsset,
    peers: getPeers,
    quote: getQuote,
    webhookEvents: getWebhookEvents,
    payments: getCombinedPayments,
    accountingTransfers: getAccountingTransfers,
    receiver: getReceiver,
    tenant: getTenant,
    tenants: getTenants
  },
  WalletAddress: {
    liquidity: getWalletAddressLiquidity,
    incomingPayments: getWalletAddressIncomingPayments,
    outgoingPayments: getWalletAddressOutgoingPayments,
    quotes: getWalletAddressQuotes,
    walletAddressKeys: getWalletAddressKeys,
    additionalProperties: getWalletAddressAdditionalProperties,
    tenant: getWalletAddressTenant
  },
  Tenant: {
    settings: getTenantSettings
  },
  IncomingPayment: {
    liquidity: getIncomingPaymentLiquidity
  },
  OutgoingPayment: {
    liquidity: getOutgoingPaymentLiquidity
  },
  Payment: {
    liquidity: getPaymentLiquidity,
    tenant: getPaymentTenant
  },
  WebhookEvent: {
    tenant: getWebhookEventTenant
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
    approveIncomingPayment,
    cancelIncomingPayment,
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
    setFee,
    updateIncomingPayment,
    createTenant,
    updateTenant,
    deleteTenant,
    createTenantSettings
  }
}
