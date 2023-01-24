import { Resolvers } from '../generated/graphql'

import { revokeGrant } from './grant'

export const resolvers: Resolvers = {
  Query: {},
  Mutation: {
    revokeGrant
  }
}
