import { gql } from '@apollo/client'
import type {
  CreateAssetMutationResponse,
  CreatePeerMutationResponse,
  LiquidityMutationResponse,
  PaymentPointer,
  CreatePaymentPointerKeyMutationResponse,
  CreatePaymentPointerKeyInput,
  CreatePaymentPointerInput,
  UpdatePaymentPointerCredentialResponse
} from '../../generated/graphql'
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

export async function updateCredential(
  paymentPointerId: string,
  credentialId: string
): Promise<UpdatePaymentPointerCredentialResponse> {
  const updateCredentialMutation = gql`
    mutation UpdatePaymentPointerCredential(
      $input: UpdatePaymentPointerCredentialInput!
    ) {
      updatePaymentPointerCredential(input: $input) {
        code
        success
        message
        paymentPointer {
          id
        }
      }
    }
  `
  const updateCredentialInput = {
    input: {
      paymentPointerId,
      credentialId
    }
  }
  return apolloClient
    .mutate({
      mutation: updateCredentialMutation,
      variables: updateCredentialInput
    })
    .then(({ data }): UpdatePaymentPointerCredentialResponse => {
      console.log(data)
      if (!data.updatePaymentPointerCredential.success) {
        throw new Error('Data was empty')
      }
      return data.updatePaymentPointerCredential
    })
}

export async function createAsset(
  code: string,
  scale: number
): Promise<CreateAssetMutationResponse> {
  const createAssetMutation = gql`
    mutation CreateAsset($input: CreateAssetInput!) {
      createAsset(input: $input) {
        code
        success
        message
        asset {
          id
          code
          scale
        }
      }
    }
  `
  const createAssetInput = {
    input: {
      code,
      scale
    }
  }
  return apolloClient
    .mutate({
      mutation: createAssetMutation,
      variables: createAssetInput
    })
    .then(({ data }): CreateAssetMutationResponse => {
      console.log(data)
      if (!data.createAsset.success) {
        throw new Error('Data was empty')
      }
      return data.createAsset
    })
}

export async function createPeer(
  staticIlpAddress: string,
  outgoingEndpoint: string,
  assetId: string,
  name: string
): Promise<CreatePeerMutationResponse> {
  const createPeerMutation = gql`
    mutation CreatePeer($input: CreatePeerInput!) {
      createPeer(input: $input) {
        code
        success
        message
        peer {
          id
          staticIlpAddress
          name
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
      assetId,
      name
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

export async function createPaymentPointer(
  backendUrl: string,
  accountName: string,
  accountUrl: string,
  assetId: string
): Promise<PaymentPointer> {
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
  const createPaymentPointerInput: CreatePaymentPointerInput = {
    assetId,
    url: accountUrl,
    publicName: accountName
  }

  return apolloClient
    .mutate({
      mutation: createPaymentPointerMutation,
      variables: {
        input: createPaymentPointerInput
      }
    })
    .then(({ data }) => {
      console.log(data)

      if (
        !data.createPaymentPointer.success ||
        !data.createPaymentPointer.paymentPointer
      ) {
        throw new Error('Data was empty')
      }

      return data.createPaymentPointer.paymentPointer
    })
}

export async function createPaymentPointerKey({
  paymentPointerId,
  jwk
}: {
  paymentPointerId: string
  jwk: string
}): Promise<CreatePaymentPointerKeyMutationResponse> {
  const createPaymentPointerKeyMutation = gql`
    mutation CreatePaymentPointerKey($input: CreatePaymentPointerKeyInput!) {
      createPaymentPointerKey(input: $input) {
        code
        success
        message
      }
    }
  `
  const createPaymentPointerKeyInput: CreatePaymentPointerKeyInput = {
    paymentPointerId,
    jwk
  }

  return apolloClient
    .mutate({
      mutation: createPaymentPointerKeyMutation,
      variables: {
        input: createPaymentPointerKeyInput
      }
    })
    .then(({ data }): CreatePaymentPointerKeyMutationResponse => {
      console.log(data)
      if (!data.createPaymentPointerKey.success) {
        throw new Error('Data was empty')
      }
      return data.createPaymentPointerKey
    })
}

export async function getPaymentPointerPayments(
  paymentPointerId: string
  // TODO: pagination
): Promise<PaymentPointer> {
  const query = gql`
    query PaymentPointer($id: String!) {
      paymentPointer(id: $id) {
        incomingPayments {
          edges {
            node {
              id
              state
              expiresAt
              incomingAmount {
                value
              }
              receivedAmount {
                value
                assetCode
                assetScale
              }
              description
              externalRef
              createdAt
            }
            cursor
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
        outgoingPayments {
          edges {
            node {
              id
              state
              error
              sendAmount {
                value
                assetCode
                assetScale
              }
              receiveAmount {
                value
                assetCode
                assetScale
              }
              receiver
              description
              externalRef
              sentAmount {
                value
                assetCode
                assetScale
              }
              createdAt
            }
            cursor
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
      }
    }
  `
  return apolloClient
    .query({
      query,
      variables: {
        id: paymentPointerId
      }
    })
    .then(({ data }): PaymentPointer => {
      if (!data.paymentPointer) {
        throw new Error('Data was empty')
      }
      return data.paymentPointer
    })
}
