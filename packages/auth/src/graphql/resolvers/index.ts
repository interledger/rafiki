import { Resolvers } from '../generated/graphql'

import { getGrantById, getGrants, revokeGrant } from './grant'

export const resolvers: Resolvers = {
  Query: {
    grants: getGrants,
    grant: getGrantById
  },
  Mutation: {
    revokeGrant
  }
}
