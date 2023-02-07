import { Resolvers } from '../generated/graphql'

import { getGrants, revokeGrant } from './grant'

export const resolvers: Resolvers = {
  Query: {
    grants: getGrants
  },
  Mutation: {
    revokeGrant
  }
}
