import { gql } from '@apollo/client/core'

export const CREATE_OUTGOING_PAYMENT_FROM_INCOMING = gql`
  mutation CreateOutgoingPaymentFromIncoming(
    $input: CreateOutgoingPaymentFromIncomingPaymentInput!
  ) {
    createOutgoingPaymentFromIncomingPayment(input: $input) {
      payment {
        id
      }
    }
  }
`
