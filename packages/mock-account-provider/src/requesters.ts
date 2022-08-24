import fetch from 'node-fetch'
import * as _ from 'lodash'

export interface GraphqlQueryConfig {
  resource: string
  method: string
  query: string
  variables: object
}

export interface GraphqlResponseElement {
  data: {
    [key: string]: { code: string }
  }
}

function testGraphqlElementSuccess(el: GraphqlResponseElement) {
  _.each(el.data, (v, k) => {
    if (v.code !== '200') {
      throw new Error(
        `graphql response for ${k} contained non-200 code: \n${JSON.stringify(
          el,
          null,
          2
        )}`
      )
    }
  })
}

export async function graphqlQuery(options: GraphqlQueryConfig) {
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
    .then((response: GraphqlResponseElement) => {
      testGraphqlElementSuccess(response as GraphqlResponseElement)
      return response
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
): Promise<PeerResponseElement> {
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
  return (await graphqlQuery({
    resource: backendUrl,
    method: 'post',
    query: createPeerQuery,
    variables: createPeerInput
  })) as PeerResponseElement
}

export interface PeerResponseElement {
  data: {
    createPeer: {
      code: string
      success: boolean
      message: string
      peer: {
        id: string
        asset: {
          code: string
          scale: number
        }
        staticIlpAddress: string
      }
    }
  }
}

export async function addPeerLiquidity(
  backendUrl: string,
  peerId: string,
  amount: string,
  transferUid: string
): Promise<PeerLiquidityResponse> {
  const addPeerLiquidityQuery = `
	mutation AddPeerLiquidity ($input: AddPeerLiquidityInput!) {
		addPeerLiquidity(input: $input) {
			code
			success
			message
			error
		}
	}
	`
  const addPeerLiquidityInput = {
    input: {
      peerId: peerId,
      amount: amount,
      id: transferUid
    }
  }
  return (await graphqlQuery({
    resource: backendUrl,
    method: 'post',
    query: addPeerLiquidityQuery,
    variables: addPeerLiquidityInput
  })) as PeerLiquidityResponse
}

export interface PeerLiquidityResponse {
  data: {
    addPeerLiquidity: {
      code: string
      success: boolean
      message: string
      error: null | string
    }
  }
}
