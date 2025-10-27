import { gql } from '@apollo/client/core'

export const GET_WALLET_ADDRESS_BY_URL = gql`
  query GetWalletAddress(
    $url: String!
    $first: Int
    $last: Int
    $before: String
    $after: String
    $sortOrder: SortOrder
  ) {
    walletAddressByUrl(url: $url) {
      id
      incomingPayments(
        first: $first
        last: $last
        before: $before
        after: $after
        sortOrder: $sortOrder
      ) {
        edges {
          node {
            id
            url
            walletAddressId
            senderWalletAddress
            state
            metadata
            incomingAmount {
              assetCode
              assetScale
              value
            }
            receivedAmount {
              assetCode
              assetScale
              value
            }
            expiresAt
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
