import { gql } from '@apollo/client'
import type {
  JwkInput,
  LiquidityMutationResponse,
  WalletAddress,
  CreateWalletAddressInput,
  CreateWalletAddressKeyMutationResponse,
  CreateWalletAddressKeyInput
} from 'generated/graphql'
import { apolloClient } from './apolloClient'
import { v4 as uuid } from 'uuid'

export async function depositPeerLiquidity(
  peerId: string,
  amount: string,
  transferUid: string
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
  return apolloClient
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
  transferId: string
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
  return apolloClient
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
  tenantId: string
): Promise<WalletAddress> {
  const createWalletAddressMutation = gql`
    mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
      createWalletAddress(input: $input) {
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
    publicName: accountName,
    additionalProperties: [],
    tenantId
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

      if (!data.createWalletAddress.walletAddress) {
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

  return apolloClient
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
