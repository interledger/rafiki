import { GraphQLSchema } from 'graphql'

import { authDirectiveTransformer } from './auth'
import { isAdminDirectiveTransformer } from './isAdmin'

export function addDirectivesToSchema(schema: GraphQLSchema): GraphQLSchema {
  return isAdminDirectiveTransformer(authDirectiveTransformer(schema))
}
