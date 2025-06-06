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

interface TenantOptions {
  tenantId: string
  apiSecret: string
}

const createAuthLink = (options?: TenantOptions) => {
  return setContext((request, { headers }) => {
    if (
      !(options || process.env.SIGNATURE_SECRET) ||
      !process.env.SIGNATURE_VERSION
    )
      return { headers }
    const timestamp = Date.now()
    const version = process.env.SIGNATURE_VERSION

    const { query, variables, operationName } = request
    const formattedRequest = {
      variables,
      operationName,
      query: print(query)
    }

    const payload = `${timestamp}.${canonicalize(formattedRequest)}`
    const hmac = createHmac(
      'sha256',
      options ? options.apiSecret : (process.env.SIGNATURE_SECRET as string)
    )
    hmac.update(payload)
    const digest = hmac.digest('hex')
    return {
      headers: {
        ...headers,
        signature: `t=${timestamp}, v${version}=${digest}`,
        ['tenant-id']: options
          ? options.tenantId
          : process.env.OPERATOR_TENANT_ID
      }
    }
  })
}

const link = ApolloLink.from([errorLink, createAuthLink(), httpLink])

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

export function generateApolloClient(
  options?: TenantOptions
): ApolloClient<NormalizedCacheObject> {
  return new ApolloClient({
    cache: new InMemoryCache({}),
    link: ApolloLink.from([createAuthLink(options), httpLink]),
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
