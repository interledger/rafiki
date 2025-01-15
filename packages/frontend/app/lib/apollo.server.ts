import { createHmac } from 'crypto'
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  createHttpLink
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { canonicalize } from 'json-canonicalize'
import { print } from 'graphql/language/printer'
import { getSession } from '~/lib/session.server'

/* eslint-disable no-var */
declare global {
  interface BigInt {
    toJSON(): string
  }
}
/* eslint-enable no-var */

// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function (this: bigint) {
  return this.toString()
}

// TODO: rm env vars? SIGNATURE_VERSION, SIGNATURE_SECRET
async function createAuthLink(request: Request) {
  return setContext(async (gqlRequest, { headers }) => {
    if (!process.env.SIGNATURE_SECRET || !process.env.SIGNATURE_VERSION)
      return { headers }
    const timestamp = Math.round(new Date().getTime() / 1000)
    const version = 1 // process.env.SIGNATURE_VERSION
    const session = await getSession(request.headers.get('cookie'))
    const apiSecret = session.get('apiSecret')

    if (!apiSecret) {
      // TODO: is this the correct behavior? same things as if sig secret and version are not set
      return { headers }
    }

    const { query, variables, operationName } = gqlRequest
    const formattedRequest = {
      variables,
      operationName,
      query: print(query)
    }

    const payload = `${timestamp}.${canonicalize(formattedRequest)}`
    const hmac = createHmac('sha256', process.env.SIGNATURE_SECRET)
    hmac.update(payload)
    const digest = hmac.digest('hex')

    const link = {
      headers: {
        ...headers,
        signature: `t=${timestamp}, v${version}=${digest}`
      }
    }

    const tenantId = session.get('tenantId')
    if (tenantId) {
      link.headers['tenant-id'] = tenantId
    }

    return link
  })
}

const httpLink = createHttpLink({
  uri: process.env.GRAPHQL_URL
})

export async function getApolloClient(request: Request) {
  return new ApolloClient({
    cache: new InMemoryCache({}),
    link: ApolloLink.from([await createAuthLink(request), httpLink])
  })
}
