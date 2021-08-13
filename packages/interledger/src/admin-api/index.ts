import { join } from 'path'
import {
  addResolversToSchema,
  GraphQLFileLoader,
  loadSchemaSync
} from 'graphql-tools'
import { ApolloServer } from 'apollo-server'

import { resolvers } from './resolvers'
import { AccountsService } from '../accounts/service'

export interface ApolloContext {
  accountsService: AccountsService
}

interface ServiceDependencies {
  accountsService: AccountsService
}

export async function createAdminApi({
  accountsService
}: ServiceDependencies): Promise<ApolloServer> {
  // Load schema from the file
  const schema = loadSchemaSync(join(__dirname, './schema.graphql'), {
    loaders: [new GraphQLFileLoader()]
  })

  // Add resolvers to the schema
  const schemaWithResolvers = addResolversToSchema({
    schema,
    resolvers
  })

  return new ApolloServer({
    schema: schemaWithResolvers,
    context: async (): Promise<ApolloContext> => {
      return {
        accountsService
      }
    }
  })
}
