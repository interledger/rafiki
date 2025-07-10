import { ApolloClient } from "@apollo/client";
import { Logger } from "pino";

type ServiceDependencies = {
  logger: Logger,
  config: Config,
  apolloClient: typeof ApolloClient
}

export function createGraphQLService(deps_: ServiceDependencies) {
  const logger = deps_.logger.child({
    service: 'GraphQLServce'
  })
  const deps = {
    ...deps_,
    logger
  }
}

const createIncomingPayment = (deps: ServiceDependencies, walletAddress: string) => {
  const client = deps.apolloClient;
  
}