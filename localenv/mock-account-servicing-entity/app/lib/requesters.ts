import { gql } from '@apollo/client'
import type {
  JwkInput,
  LiquidityMutationResponse,
  WalletAddress,
  CreateWalletAddressInput,
  CreateWalletAddressKeyMutationResponse,
  CreateWalletAddressKeyInput
} from 'generated/graphql'
import { apolloClient, generateApolloClient } from './apolloClient'
import { v4 as uuid } from 'uuid'
import { TenantOptions } from './types'

export async function listTenants() {
  const listTenantsQuery = gql`
    query ListTenantsQuery {
      tenants {
        edges {
          node {
            id
            apiSecret
          }
        }
      }
    }
  `

  const response = await apolloClient.query({
    query: listTenantsQuery
  })

  return response.data.tenants
}

export async function depositPeerLiquidity(
  peerId: string,
  amount: string,
  transferUid: string,
  options?: TenantOptions
): Promise<LiquidityMutationResponse> {
  const depositPeerLiquidityMutation = gql`
    mutation DepositPeerLiquidity($input: DepositPeerLiquidityInput!) {
      depositPeerLiquidity(input: $input) {
        success
      }
    }
  `
  const depositPeerLiquidityInput = {
    input: {
      peerId: peerId,
      amount: amount,
      id: transferUid,
      idempotencyKey: uuid()
    }
  }
  return generateApolloClient(options)
    .mutate({
      mutation: depositPeerLiquidityMutation,
      variables: depositPeerLiquidityInput
    })
    .then(({ data }): LiquidityMutationResponse => {
      console.log(data)
      if (!data.depositPeerLiquidity) {
        throw new Error('Data was empty')
      }
      return data.depositPeerLiquidity
    })
}

export async function depositAssetLiquidity(
  assetId: string,
  amount: number,
  transferId: string,
  options?: TenantOptions
): Promise<LiquidityMutationResponse> {
  const depositAssetLiquidityMutation = gql`
    mutation DepositAssetLiquidity($input: DepositAssetLiquidityInput!) {
      depositAssetLiquidity(input: $input) {
        success
      }
    }
  `
  const depositAssetLiquidityInput = {
    input: {
      assetId,
      amount,
      id: transferId,
      idempotencyKey: uuid()
    }
  }
  return generateApolloClient(options)
    .mutate({
      mutation: depositAssetLiquidityMutation,
      variables: depositAssetLiquidityInput
    })
    .then(({ data }): LiquidityMutationResponse => {
      console.log(data)
      if (!data.depositAssetLiquidity) {
        throw new Error('Data was empty')
      }
      return data.depositAssetLiquidity
    })
}

export async function createWalletAddress(
  accountName: string,
  accountUrl: string,
  assetId: string,
  options?: TenantOptions
): Promise<WalletAddress> {
  const createWalletAddressMutation = gql`
    mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
      createWalletAddress(input: $input) {
        walletAddress {
          id
          address
          publicName
        }
      }
    }
  `
  const createWalletAddressInput: CreateWalletAddressInput = {
    assetId,
    address: accountUrl,
    publicName: accountName,
    additionalProperties: []
  }

  return generateApolloClient(options)
    .mutate({
      mutation: createWalletAddressMutation,
      variables: {
        input: createWalletAddressInput
      }
    })
    .then(({ data }) => {
      console.log(data)

      if (!data.createWalletAddress.walletAddress) {
        throw new Error('Data was empty')
      }

      return data.createWalletAddress.walletAddress
    })
}

export async function createWalletAddressKey({
  walletAddressId,
  jwk,
  options
}: {
  walletAddressId: string
  jwk: string
  options?: TenantOptions
}): Promise<CreateWalletAddressKeyMutationResponse> {
  const createWalletAddressKeyMutation = gql`
    mutation CreateWalletAddressKey($input: CreateWalletAddressKeyInput!) {
      createWalletAddressKey(input: $input) {
        walletAddressKey {
          id
          walletAddressId
        }
      }
    }
  `
  const createWalletAddressKeyInput: CreateWalletAddressKeyInput = {
    walletAddressId,
    jwk: jwk as unknown as JwkInput
  }

  return generateApolloClient(options)
    .mutate({
      mutation: createWalletAddressKeyMutation,
      variables: {
        input: createWalletAddressKeyInput
      }
    })
    .then(({ data }): CreateWalletAddressKeyMutationResponse => {
      if (!data.createWalletAddressKey.walletAddressKey) {
        throw new Error('Data was empty')
      }
      return data.createWalletAddressKey
    })
}

export async function getWalletAddressPayments(
  walletAddressId: string,
  options?: TenantOptions
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
  return generateApolloClient(options)
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
