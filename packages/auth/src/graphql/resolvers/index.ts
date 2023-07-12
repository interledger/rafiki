import { Resolvers } from '../generated/graphql'

import { getGrantById, getGrants, revokeGrant } from './grant'
import { GraphQLBigInt, GraphQLUInt8 } from '../scalars'

export const resolvers: Resolvers = {
  UInt8: GraphQLUInt8,
  UInt64: GraphQLBigInt,
  Query: {
    grants: getGrants,
    grant: getGrantById
  },
  Mutation: {
    revokeGrant
  }
}
