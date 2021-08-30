import { Resolvers } from '../generated/graphql'
import { extendCredit, revokeCredit, utilizeCredit, settleDebt } from './credit'
import { createDeposit } from './deposit'
import {
  getIlpAccounts,
  getIlpAccount,
  getIlpAccountsConnectionPageInfo,
  getSubAccountsConnectionPageInfo,
  getBalance,
  getSuperAccount,
  createIlpAccount,
  updateIlpAccount,
  deleteIlpAccount,
  createIlpSubAccount,
  getSubAccounts
} from './ilpAccount'
import {
  createWithdrawal,
  finalizePendingWithdrawal,
  rollbackPendingWithdrawal
} from './withdrawal'
import { GraphQLBigInt } from '../scalars'

//TODO: Implement functions for resolvers when there are the relevant services available.

export const resolvers: Resolvers = {
  UInt64: GraphQLBigInt,
  Query: {
    ilpAccounts: getIlpAccounts,
    ilpAccount: getIlpAccount
    // webhook: getWebhook,
    // deposit: getDeposit,
    // withdrawal: getWithdrawal
  },
  Mutation: {
    createIlpAccount: createIlpAccount,
    updateIlpAccount: updateIlpAccount,
    deleteIlpAccount: deleteIlpAccount,
    createIlpSubAccount: createIlpSubAccount,
    // transfer: createTransfer,
    extendCredit: extendCredit,
    revokeCredit: revokeCredit,
    utilizeCredit: utilizeCredit,
    settleDebt: settleDebt,
    // createWebhook: createWebhook,
    // updateWebhook: updateWebhook,
    // deleteWebhook: deleteWebhook,
    createDeposit: createDeposit,
    createWithdrawal: createWithdrawal,
    finalizePendingWithdrawal: finalizePendingWithdrawal,
    rollbackPendingWithdrawal: rollbackPendingWithdrawal
  },
  IlpAccount: {
    balance: getBalance,
    superAccount: getSuperAccount,
    subAccounts: getSubAccounts
    // webhooks: getWebhooks,
    // deposits: getDeposits,
    // withdrawals: getWithdrawals,
  },
  IlpAccountsConnection: {
    pageInfo: getIlpAccountsConnectionPageInfo
  },
  SubAccountsConnection: {
    pageInfo: getSubAccountsConnectionPageInfo
  },
  WebhooksConnection: {
    // pageInfo: getWebhooksConnectionPageInfo
  },
  DepositsConnection: {
    // pageInfo: getDepositsConnectionPageInfo
  },
  WithdrawalsConnection: {
    // pageInfo: getWithdrawalsConnectionPageInfo
  }
}
