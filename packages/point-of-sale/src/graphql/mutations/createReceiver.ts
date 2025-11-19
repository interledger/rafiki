import { gql } from '@apollo/client'

export const CREATE_RECEIVER = gql`
  mutation CreateReceiver($input: CreateReceiverInput!) {
    createReceiver(input: $input) {
      receiver {
        id
        metadata
        incomingAmount {
          value
          assetCode
          assetScale
        }
      }
    }
  }
`
