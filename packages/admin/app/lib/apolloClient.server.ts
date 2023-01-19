import { ApolloClient, InMemoryCache } from '@apollo/client'
import type { NormalizedCacheObject } from '@apollo/client'

/* eslint-disable no-var */
declare global {
  var __apolloClient: ApolloClient<NormalizedCacheObject> | undefined
}
/* eslint-enable no-var */

if (!global.__apolloClient) {
  global.__apolloClient = new ApolloClient({
    cache: new InMemoryCache({ resultCaching: false }),
    defaultOptions: {
      query: {
        fetchPolicy: 'no-cache'
      },
      mutate: {
        fetchPolicy: 'no-cache'
      }
    },
    uri: 'http://localhost:3001/graphql' // TODO: move into a configuration file
  })
}
const apolloClient = global.__apolloClient

export { apolloClient }
