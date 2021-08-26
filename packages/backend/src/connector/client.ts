import {
  ApolloClient,
  ApolloLink,
  createHttpLink,
  InMemoryCache,
  NormalizedCacheObject
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { onError } from '@apollo/client/link/error'
import { Logger as PinoLogger } from '../logger/service'

type Logger = typeof PinoLogger

export function connectorClient(
  logger: Logger,
  port: number
): ApolloClient<NormalizedCacheObject> {
  const httpLink = createHttpLink({
    // TODO: Update host?
    uri: `http://localhost:${port}/graphql`,
    fetch
  })
  const errorLink = onError(({ graphQLErrors }) => {
    if (graphQLErrors) {
      logger.error(graphQLErrors)
      graphQLErrors.map(({ extensions }) => {
        if (extensions && extensions.code === 'UNAUTHENTICATED') {
          logger.error('UNAUTHENTICATED')
        }

        if (extensions && extensions.code === 'FORBIDDEN') {
          logger.error('FORBIDDEN')
        }
      })
    }
  })
  const authLink = setContext((_, { headers }) => {
    return {
      headers: {
        ...headers
      }
    }
  })

  const link = ApolloLink.from([errorLink, authLink, httpLink])

  return new ApolloClient({
    cache: new InMemoryCache({}),
    link: link,
    defaultOptions: {
      query: {
        fetchPolicy: 'no-cache'
      },
      mutate: {
        fetchPolicy: 'no-cache'
      },
      watchQuery: {
        fetchPolicy: 'no-cache'
      }
    }
  })
}
