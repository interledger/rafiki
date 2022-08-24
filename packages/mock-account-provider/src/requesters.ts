import fetch from 'node-fetch'
import * as _ from 'lodash'
import { gql } from '@apollo/client'
import type { CreatePeerMutationResponse } from '../generated/graphql'
import { apolloClient } from './apolloClient'

export interface GraphqlQueryConfig {
  resource: string
  method: string
  query: string
  variables: object
}

export interface GraphqlResponseElement {
  data: [{ code: string }]
}

export interface GraphqlResponseArray {
  [index: number]: GraphqlResponseElement
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

function isGraphqlArray(a: GraphqlResponseElement | GraphqlResponseArray) {
  if (_.isArray(a)) {
    return a as GraphqlResponseArray
  }
  return a as GraphqlResponseElement
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
    .then((response: GraphqlResponseElement | GraphqlResponseArray) => {
      if (isGraphqlArray(response)) {
        _.each(response, testGraphqlElementSuccess)
      } else {
        testGraphqlElementSuccess(response as GraphqlResponseElement)
      }
      return response
    })
    .catch((e) => {
      console.log(e)
      throw e
    })
}

export async function createPeer(
  staticIlpAddress: string,
  outgoingEndpoint: string,
  assetCode: string,
  assetScale: number
): Promise<CreatePeerMutationResponse> {
  const createPeerMutation = gql`
    mutation CreatePeer($input: CreatePeerInput!) {
      createPeer(input: $input) {
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
  return apolloClient
    .mutate({
      mutation: createPeerMutation,
      variables: createPeerInput
    })
    .then(({ data }): CreatePeerMutationResponse => {
      if (!data.success) {
        throw new Error('Data was empty')
      }
      return data
    })
}

export async function addPeerLiquidity(
  backendUrl: string,
  peerId: string,
  outgoingEndpoint: string,
  assetCode: string,
  assetScale: number
): Promise<object> {
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
      peerId: 'INSERT_PEER_ID',
      amount: '10000',
      id: 'a09b730d-8610-4fda-98fa-ec7acb19c775'
    }
  }
  return graphqlQuery({
    resource: backendUrl,
    method: 'post',
    query: addPeerLiquidityQuery,
    variables: addPeerLiquidityInput
  })
}
