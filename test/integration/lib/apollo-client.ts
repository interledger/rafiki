import type { NormalizedCacheObject } from '@apollo/client'
import {
  ApolloClient,
  ApolloLink,
  createHttpLink,
  InMemoryCache
} from '@apollo/client'
import { createHmac } from 'crypto'
import { print } from 'graphql/language/printer'
import { canonicalize } from 'json-canonicalize'
import { setContext } from '@apollo/client/link/context'

interface CreateApolloClientArgs {
  graphqlUrl: string
  signatureSecret: string
  signatureVersion: string
  operatorTenantId: string
}

function createAuthLink(args: CreateApolloClientArgs) {
  return setContext((request, { headers }) => {
    const timestamp = Math.round(new Date().getTime() / 1000)
    const version = args.signatureVersion

    const { query, variables, operationName } = request
    const formattedRequest = {
      variables,
      operationName,
      query: print(query)
    }

    const payload = `${timestamp}.${canonicalize(formattedRequest)}`
    const hmac = createHmac('sha256', args.signatureSecret)
    hmac.update(payload)
    const digest = hmac.digest('hex')
    return {
      headers: {
        ...headers,
        signature: `t=${timestamp}, v${version}=${digest}`,
        'tenant-id': args.operatorTenantId
      }
    }
  })
}

export function createApolloClient(
  args: CreateApolloClientArgs
): ApolloClient<NormalizedCacheObject> {
  const httpLink = createHttpLink({
    uri: args.graphqlUrl
  })

  return new ApolloClient({
    link: ApolloLink.from([createAuthLink(args), httpLink]),
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
