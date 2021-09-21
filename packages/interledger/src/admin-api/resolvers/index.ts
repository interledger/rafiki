import { Resolvers } from '../generated/graphql'
import { extendCredit, revokeCredit, utilizeCredit, settleDebt } from './credit'
import { createDeposit } from './deposit'
import {
  createWithdrawal,
  finalizePendingWithdrawal,
  rollbackPendingWithdrawal
} from './withdrawal'

//TODO: Implement functions for resolvers when there are the relevant services available.

export const resolvers: Resolvers = {
  Query: {
    // deposit: getDeposit,
    // withdrawal: getWithdrawal
  },
  Mutation: {
    // transfer: createTransfer,
    extendCredit: extendCredit,
    revokeCredit: revokeCredit,
    utilizeCredit: utilizeCredit,
    settleDebt: settleDebt,
    createDeposit: createDeposit,
    createWithdrawal: createWithdrawal,
    finalizePendingWithdrawal: finalizePendingWithdrawal,
    rollbackPendingWithdrawal: rollbackPendingWithdrawal
  },
  IlpAccount: {
    // deposits: getDeposits,
    // withdrawals: getWithdrawals,
  },
  DepositsConnection: {
    // pageInfo: getDepositsConnectionPageInfo
  },
  WithdrawalsConnection: {
    // pageInfo: getWithdrawalsConnectionPageInfo
  }
}
