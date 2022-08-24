import type { NormalizedCacheObject } from '@apollo/client'
import {
  createHttpLink,
  ApolloLink,
  ApolloClient,
  InMemoryCache
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { CONFIG } from './parse_config'
import { onError } from '@apollo/client/link/error'

const httpLink = createHttpLink({
  uri: CONFIG.self.graphqlUrl
})

const errorLink = onError(({ graphQLErrors }) => {
  if (graphQLErrors) {
    console.error(graphQLErrors)
    graphQLErrors.map(({ extensions }) => {
      if (extensions && extensions.code === 'UNAUTHENTICATED') {
        console.error('UNAUTHENTICATED')
      }

      if (extensions && extensions.code === 'FORBIDDEN') {
        console.error('FORBIDDEN')
      }
      return extensions
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

export const apolloClient: ApolloClient<NormalizedCacheObject> =
  new ApolloClient({
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
