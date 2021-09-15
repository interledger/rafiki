import { join } from 'path'
import { loadSchemaSync } from '@graphql-tools/load'
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader'
import { ApolloServer } from 'apollo-server'
import { Logger } from 'pino'

import { resolvers } from './resolvers'
import { AccountService } from '../account/service'
import { CreditService } from '../credit/service'
import { DepositService } from '../deposit/service'
import { TransferService } from '../transfer/service'
import { WithdrawalService } from '../withdrawal/service'
import { addResolversToSchema } from '@graphql-tools/schema'

export interface ApolloContext {
  accountService: AccountService
  creditService: CreditService
  depositService: DepositService
  transferService: TransferService
  withdrawalService: WithdrawalService
  logger: Logger
}

interface ServiceDependencies {
  accountService: AccountService
  creditService: CreditService
  depositService: DepositService
  transferService: TransferService
  withdrawalService: WithdrawalService
  logger: Logger
}

export async function createAdminApi({
  accountService,
  creditService,
  depositService,
  transferService,
  withdrawalService,
  logger
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
        accountService,
        creditService,
        depositService,
        transferService,
        withdrawalService,
        logger
      }
    }
  })
}
