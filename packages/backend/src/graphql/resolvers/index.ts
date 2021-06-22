import { Resolvers } from '../generated/graphql.gen'
import { getUser } from './user'

export const resolvers: Resolvers = {
  Query: {
    user: getUser
  },
  User: {},
  Account: {},
  Invoice: {}
}
