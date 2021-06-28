import { Resolvers } from '../generated/graphql'
import { getUser, getAccount, getBalance } from './user'

export const resolvers: Resolvers = {
  Query: {
    user: getUser
  },
  User: {
    account: getAccount
  },
  Account: {
    balance: getBalance
  }
}
