import createLogger from 'pino'
import fetch from 'cross-fetch'

import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  ApolloLink
} from '@apollo/client'

import { onError } from '@apollo/client/link/error'
import { setContext } from '@apollo/client/link/context'

const logger = createLogger({
  prettyPrint: {
    translateTime: true,
    ignore: 'pid,hostname'
  },
  level: process.env.LOG_LEVEL || 'error',
  name: 'test-logger'
})

const httpLink = createHttpLink({
  uri: `http://localhost:${parseInt(
    process.env.ADMIN_API_PORT || '3001',
    10
  )}/graphql`,
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

export const apolloClient = new ApolloClient({
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
