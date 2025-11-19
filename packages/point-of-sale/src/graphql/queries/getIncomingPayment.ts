import { gql } from '@apollo/client'

export const GET_INCOMING_PAYMENT = gql`
  query GetIncomingPaymentSenderAndAmount($id: String!) {
    incomingPayment(id: $id) {
      id
      senderWalletAddress
      incomingAmount {
        value
        assetCode
        assetScale
      }
    }
  }
`
