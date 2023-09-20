import { gql } from '@apollo/client'
import type {
  AssetMutationResponse,
  CreatePeerMutationResponse,
  LiquidityMutationResponse,
  WalletAddress,
  CreateWalletAddressKeyMutationResponse,
  CreateWalletAddressKeyInput,
  CreateWalletAddressInput,
  JwkInput,
  SetFeeResponse,
  FeeType
} from '../../generated/graphql'
import { apolloClient } from './apolloClient'
import { v4 as uuid } from 'uuid'

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

export async function createAsset(
  code: string,
  scale: number,
  liquidityThreshold: number
): Promise<AssetMutationResponse> {
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
          liquidityThreshold
        }
      }
    }
  `
  const createAssetInput = {
    input: {
      code,
      scale,
      liquidityThreshold
    }
  }
  return apolloClient
    .mutate({
      mutation: createAssetMutation,
      variables: createAssetInput
    })
    .then(({ data }): AssetMutationResponse => {
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
  assetCode: string,
  name: string,
  liquidityThreshold: number
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
          liquidityThreshold
        }
      }
    }
  `
  const createPeerInput = {
    input: {
      staticIlpAddress,
      http: {
        incoming: { authTokens: [`test-${assetCode}`] },
        outgoing: { endpoint: outgoingEndpoint, authToken: `test-${assetCode}` }
      },
      assetId,
      name,
      liquidityThreshold
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
      id: transferUid,
      idempotencyKey: uuid()
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

export async function addAssetLiquidity(
  assetId: string,
  amount: number,
  transferId: string
): Promise<LiquidityMutationResponse> {
  const addAssetLiquidityMutation = gql`
    mutation AddAssetLiquidity($input: AddAssetLiquidityInput!) {
      addAssetLiquidity(input: $input) {
        code
        success
        message
        error
      }
    }
  `
  const addAssetLiquidityInput = {
    input: {
      assetId,
      amount,
      id: transferId,
      idempotencyKey: uuid()
    }
  }
  return apolloClient
    .mutate({
      mutation: addAssetLiquidityMutation,
      variables: addAssetLiquidityInput
    })
    .then(({ data }): LiquidityMutationResponse => {
      console.log(data)
      if (!data.addAssetLiquidity.success) {
        throw new Error('Data was empty')
      }
      return data.addAssetLiquidity
    })
}

export async function createWalletAddress(
  accountName: string,
  accountUrl: string,
  assetId: string
): Promise<WalletAddress> {
  const createWalletAddressMutation = gql`
    mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
      createWalletAddress(input: $input) {
        code
        success
        message
        walletAddress {
          id
          url
          publicName
        }
      }
    }
  `
  const createWalletAddressInput: CreateWalletAddressInput = {
    assetId,
    url: accountUrl,
    publicName: accountName
  }

  return apolloClient
    .mutate({
      mutation: createWalletAddressMutation,
      variables: {
        input: createWalletAddressInput
      }
    })
    .then(({ data }) => {
      console.log(data)

      if (
        !data.createWalletAddress.success ||
        !data.createWalletAddress.walletAddress
      ) {
        throw new Error('Data was empty')
      }

      return data.createWalletAddress.walletAddress
    })
}

export async function createWalletAddressKey({
  walletAddressId,
  jwk
}: {
  walletAddressId: string
  jwk: string
}): Promise<CreateWalletAddressKeyMutationResponse> {
  const createWalletAddressKeyMutation = gql`
    mutation CreateWalletAddressKey($input: CreateWalletAddressKeyInput!) {
      createWalletAddressKey(input: $input) {
        code
        success
        message
      }
    }
  `
  const createWalletAddressKeyInput: CreateWalletAddressKeyInput = {
    walletAddressId,
    jwk: jwk as unknown as JwkInput
  }

  return apolloClient
    .mutate({
      mutation: createWalletAddressKeyMutation,
      variables: {
        input: createWalletAddressKeyInput
      }
    })
    .then(({ data }): CreateWalletAddressKeyMutationResponse => {
      console.log(data)
      if (!data.createWalletAddressKey.success) {
        throw new Error('Data was empty')
      }
      return data.createWalletAddressKey
    })
}

export async function getWalletAddressPayments(
  walletAddressId: string
): Promise<WalletAddress> {
  const query = gql`
    query WalletAddress($id: String!) {
      walletAddress(id: $id) {
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
              metadata
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
              debitAmount {
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
              metadata
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
        id: walletAddressId
      }
    })
    .then(({ data }): WalletAddress => {
      if (!data.walletAddress) {
        throw new Error('Data was empty')
      }
      return data.walletAddress
    })
}

export async function setFee(
  assetId: string,
  type: FeeType,
  fixed: number,
  basisPoints: number
): Promise<SetFeeResponse> {
  const setFeeMutation = gql`
    mutation SetFee($input: SetFeeInput!) {
      setFee(input: $input) {
        code
        success
        message
        fee {
          id
          assetId
          type
          fixed
          basisPoints
        }
      }
    }
  `

  const setFeeInput = {
    assetId,
    type,
    fee: {
      fixed: String(fixed),
      basisPoints
    }
  }

  return apolloClient
    .mutate({
      mutation: setFeeMutation,
      variables: {
        input: setFeeInput
      }
    })
    .then(({ data }): SetFeeResponse => {
      console.log(data)
      if (!data.setFee) {
        throw new Error('Data was empty')
      }
      return data.setFee
    })
}
