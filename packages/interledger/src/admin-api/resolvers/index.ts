import { Resolvers } from '../generated/graphql'
import { bigintScalar } from './scalars'
import {
  getIlpAccounts,
  getIlpAccount,
  getIlpAccountsConnectionPageInfo,
  getSuperAccount,
  createIlpAccount,
  updateIlpAccount,
  deleteIlpAccount,
  createIlpSubAccount,
  getSubAccounts
} from './ilpAccount'

//TODO: Implement functions for resolvers when there are the relevant services available.

export const resolvers: Resolvers = {
  Query: {
    ilpAccounts: getIlpAccounts,
    ilpAccount: getIlpAccount
    // trustline: getTrustline,
    // webhook: getWebhook,
    // deposit: getDeposit,
    // withdrawal: getWithdrawal
  },
  Mutation: {
    createIlpAccount: createIlpAccount,
    updateIlpAccount: updateIlpAccount,
    deleteIlpAccount: deleteIlpAccount,
    createIlpSubAccount: createIlpSubAccount
    // transfer: createTransfer,
    // extendTrustline: extendTrustline,
    // revokeTrustline: revokeTrustline,
    // utilizeTrustline: utilizeTrustline,
    // settleTrustline: settleTrustline,
    // createWebhook: createWebhook,
    // updateWebhook: updateWebhook,
    // deleteWebhook: deleteWebhook,
    // createDeposit: createDeposit,
    // createWithdrawal: createWithdrawal,
    // finalizePendingWithdrawal: finalizePendingWithdrawal,
    // rollbackPendingWithdrawal: rollbackPendingWithdrawal
  },
  IlpAccount: {
    superAccount: getSuperAccount,
    subAccounts: getSubAccounts
    // webhooks: getWebhooks,
    // deposits: getWebhooks,
    // withdrawals: getWebhooks,
  },
  IlpAccountsConnection: {
    pageInfo: getIlpAccountsConnectionPageInfo
  },
  WebhooksConnection: {
    // pageInfo: getIlpAccountsConnectionPageInfo
  },
  DepositsConnection: {
    // pageInfo: getIlpAccountsConnectionPageInfo
  },
  WithdrawalsConnection: {
    // pageInfo: getIlpAccountsConnectionPageInfo
  },
  UInt64: bigintScalar
}
