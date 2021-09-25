import { Resolvers } from '../generated/graphql'
import { extendCredit, revokeCredit, utilizeCredit, settleDebt } from './credit'
import {
  createWithdrawal,
  finalizePendingWithdrawal,
  rollbackPendingWithdrawal
} from './withdrawal'

//TODO: Implement functions for resolvers when there are the relevant services available.

export const resolvers: Resolvers = {
  Query: {
    // withdrawal: getWithdrawal
  },
  Mutation: {
    // transfer: createTransfer,
    extendCredit: extendCredit,
    revokeCredit: revokeCredit,
    utilizeCredit: utilizeCredit,
    settleDebt: settleDebt,
    createWithdrawal: createWithdrawal,
    finalizePendingWithdrawal: finalizePendingWithdrawal,
    rollbackPendingWithdrawal: rollbackPendingWithdrawal
  },
  IlpAccount: {
    // withdrawals: getWithdrawals,
  },
  WithdrawalsConnection: {
    // pageInfo: getWithdrawalsConnectionPageInfo
  }
}
