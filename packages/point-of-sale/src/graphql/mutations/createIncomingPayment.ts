import { gql } from '@apollo/client'

export const CREATE_INCOMING_PAYMENT = gql`
  mutation CreateIncomingPayment($input: CreateIncomingPaymentInput!) {
    createIncomingPayment(input: $input) {
      payment {
        id
        url
      }
    }
  }
`
