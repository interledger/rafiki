import { gql } from '@apollo/client/core'

export const GET_WALLET_ADDRESS_BY_URL = gql`
  query GetWalletAddressByUrl($url: String!) {
    walletAddressByUrl(url: $url) {
      id
      asset {
        code
        scale
      }
    }
  }
`
