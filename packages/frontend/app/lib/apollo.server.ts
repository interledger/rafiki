import { ApolloClient, InMemoryCache } from '@apollo/client'
import type { NormalizedCacheObject } from '@apollo/client'

/* eslint-disable no-var */
declare global {
  var __apolloClient: ApolloClient<NormalizedCacheObject> | undefined

  interface BigInt {
    toJSON(): string
  }
}
/* eslint-enable no-var */

// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function (this: bigint) {
  return this.toString()
}

if (!global.__apolloClient) {
  global.__apolloClient = new ApolloClient({
    cache: new InMemoryCache({}),
    defaultOptions: {
      query: {
        fetchPolicy: 'no-cache'
      },
      mutate: {
        fetchPolicy: 'no-cache'
      }
    },
    uri: process.env.GRAPHQL_URL ?? 'http://localhost:3001/graphql'
  })
}
const apolloClient = global.__apolloClient

export { apolloClient }
