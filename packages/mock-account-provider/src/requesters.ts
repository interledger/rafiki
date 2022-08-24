import fetch from 'node-fetch'
import * as _ from 'lodash'

export interface GraphqlQueryConfig {
  resource: string
  method: string
  query: string
  variables: object
}

export async function graphqlQuery(options: GraphqlQueryConfig) {
  console.log(options.resource)
  return await fetch(options.resource, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: options.query, variables: options.variables })
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `response not ok: ${response.status} ${response.statusText}`
        )
      }
      return response.json()
    })
    .then((data: { data: [{ code: string }] }) => {
      _.each(data.data, (v, k) => {
        if (v.code !== '200') {
          throw new Error(
            `graphql response for ${k} contained non-200 code: \n${JSON.stringify(
              data,
              null,
              2
            )}`
          )
        }
      })
      return data
    })
    .catch((e) => {
      console.log(e)
      throw e
    })
}

export async function createPeer(
  backendUrl: string,
  staticIlpAddress: string,
  outgoingEndpoint: string,
  assetCode: string,
  assetScale: number
): Promise<object> {
  const createPeerQuery = `
  mutation CreatePeer ($input: CreatePeerInput!) {
    createPeer (input: $input) {
      code
      success
      message
      peer {
        id
        asset {
          code
          scale
        }
        staticIlpAddress
      }
    }
  }
  `
  const createPeerInput = {
    input: {
      staticIlpAddress,
      http: {
        incoming: { authTokens: ['test'] },
        outgoing: { endpoint: outgoingEndpoint, authToken: 'test' }
      },
      asset: {
        code: assetCode,
        scale: assetScale
      }
    }
  }
  return graphqlQuery({
    resource: backendUrl,
    method: 'post',
    query: createPeerQuery,
    variables: createPeerInput
  })
}
