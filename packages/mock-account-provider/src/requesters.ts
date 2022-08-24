import fetch from 'node-fetch'
import * as _ from 'lodash'
import { gql } from '@apollo/client'
import type {
  CreatePeerMutationResponse,
  LiquidityMutationResponse,
  CreatePaymentPointerMutationResponse
} from '../generated/graphql'
import { apolloClient } from './apolloClient'

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
      console.log(data)
      if (!data.createPeer.success) {
        throw new Error('Data was empty')
      }
      return data.createPeer
    })
}

export async function addPeerLiquidity(
  backendUrl: string,
  peerId: string,
  amount: string,
  transferUid: string
): Promise<LiquidityMutationResponse> {
  const addPeerLiquidityMutation = gql`
    mutation AddPeerLiquidity($input: AddPeerLiquidityInput!) {
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
  return apolloClient
    .mutate({
      mutation: addPeerLiquidityMutation,
      variables: addPeerLiquidityInput
    })
    .then(({ data }): LiquidityMutationResponse => {
      console.log(data)
      if (!data.addPeerLiquidity.success) {
        throw new Error('Data was empty')
      }
      return data.addPeerLiquidity
    })
}

export async function createAccount(
  backendUrl: string,
  accountName: string,
  accountUrl: string,
  assetCode: string,
  assetScale: number
): Promise<CreatePaymentPointerMutationResponse> {
  const createPaymentPointerMutation = gql`
    mutation CreatePaymentPointer($input: CreatePaymentPointerInput!) {
      createPaymentPointer(input: $input) {
        code
        success
        message
        paymentPointer {
          id
          url
          publicName
        }
      }
    }
  `
  const createPaymentPointerInput = {
    input: {
      asset: {
        code: assetCode,
        scale: assetScale
      },
      url: accountUrl,
      publicName: accountName
    }
  }
  return apolloClient
    .mutate({
      mutation: createPaymentPointerMutation,
      variables: createPaymentPointerInput
    })
    .then(({ data }): CreatePaymentPointerMutationResponse => {
      console.log(data)
      if (!data.createPaymentPointer.success) {
        throw new Error('Data was empty')
      }
      return data.createPaymentPointer
    })
}
