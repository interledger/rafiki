import type { NormalizedCacheObject } from '@apollo/client'
import { ApolloClient, InMemoryCache, gql } from '@apollo/client'

export function createApolloClient(
  graphqlUrl: string
): ApolloClient<NormalizedCacheObject> {
  return new ApolloClient({
    uri: graphqlUrl,
    cache: new InMemoryCache(),
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
