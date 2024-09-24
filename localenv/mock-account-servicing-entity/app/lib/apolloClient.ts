import { createHmac } from 'crypto'

import { canonicalize } from 'json-canonicalize'
import { print } from 'graphql/language/printer'
import type { NormalizedCacheObject } from '@apollo/client'
import {
  createHttpLink,
  ApolloLink,
  ApolloClient,
  InMemoryCache
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { CONFIG } from './parse_config.server'
import { onError } from '@apollo/client/link/error'

const httpLink = createHttpLink({
  uri: CONFIG.graphqlUrl
})

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

const authLink = setContext((request, { headers }) => {
  if (!process.env.SIGNATURE_SECRET || !process.env.SIGNATURE_VERSION)
    return { headers }
  const timestamp = Math.round(new Date().getTime() / 1000)
  const version = process.env.SIGNATURE_VERSION

  const { query, variables, operationName } = request
  const formattedRequest = {
    variables,
    operationName,
    query: print(query)
  }

  const payload = `${timestamp}.${canonicalize(formattedRequest)}`
  const hmac = createHmac('sha256', process.env.SIGNATURE_SECRET)
  hmac.update(payload)
  const digest = hmac.digest('hex')
  return {
    headers: {
      ...headers,
      signature: `t=${timestamp}, v${version}=${digest}`,
      'x-operator-secret': process.env.OPERATOR_API_SECRET
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
