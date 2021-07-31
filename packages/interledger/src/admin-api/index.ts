import { join } from 'path'
import { loadSchemaSync } from '@graphql-tools/load'
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader'
import { ApolloServer } from 'apollo-server'

import { resolvers } from './resolvers'
// import { AccountsService } from '../accounts/service'
import { AccountsService as AccountsServiceInterface } from '../accounts/types'
import { addResolversToSchema } from '@graphql-tools/schema'

export interface ApolloContext {
  accountsService: AccountsServiceInterface
}

interface ServiceDependencies {
  accountsService: AccountsServiceInterface
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
