import { Resolvers } from '../generated/graphql'
import { extendCredit, revokeCredit, utilizeCredit, settleDebt } from './credit'

//TODO: Implement functions for resolvers when there are the relevant services available.

export const resolvers: Resolvers = {
  Mutation: {
    // transfer: createTransfer,
    extendCredit: extendCredit,
    revokeCredit: revokeCredit,
    utilizeCredit: utilizeCredit,
    settleDebt: settleDebt,
  }
}
