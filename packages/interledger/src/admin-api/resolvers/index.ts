import { Resolvers } from '../generated/graphql'
import { bigintScalar } from './scalars'

export const resolvers: Resolvers = {
  Query: {},
  UInt64: bigintScalar
}
