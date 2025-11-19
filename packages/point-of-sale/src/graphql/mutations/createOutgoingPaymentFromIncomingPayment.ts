import { gql } from '@apollo/client'

export const CREATE_OUTGOING_PAYMENT_FROM_INCOMING_PAYMENT = gql`
  mutation CreateOutgoingPaymentFromIncomingPayment(
    $input: CreateOutgoingPaymentFromIncomingPaymentInput!
  ) {
    createOutgoingPaymentFromIncomingPayment(input: $input) {
      payment {
        id
        walletAddressId
        createdAt
      }
    }
  }
`
