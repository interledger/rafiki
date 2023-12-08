import { gql } from '@apollo/client'
import {
  type QueryIncomingPaymentArgs,
  type QueryPaymentsArgs,
  type QueryOutgoingPaymentArgs,
  type GetIncomingPayment,
  type GetIncomingPaymentVariables,
  type GetOutgoingPaymentVariables,
  type GetOutgoingPayment,
  ListPaymentsQuery,
  ListPaymentsQueryVariables
} from '~/generated/graphql'
import { apolloClient } from '../apollo.server'

export const getIncomingPayment = async (args: QueryIncomingPaymentArgs) => {
  await apolloClient.query
  const response = await apolloClient.query<
    GetIncomingPayment,
    GetIncomingPaymentVariables
  >({
    query: gql`
      query GetIncomingPayment($id: String!) {
        incomingPayment(id: $id) {
          id
          walletAddressId
          state
          expiresAt
          incomingAmount {
            value
            assetCode
            assetScale
          }
          receivedAmount {
            value
            assetCode
            assetScale
          }
          metadata
          createdAt
          liquidity
        }
      }
    `,
    variables: args
  })
  return response.data.incomingPayment
}

export const getOutgoingPayment = async (args: QueryOutgoingPaymentArgs) => {
  const response = await apolloClient.query<
    GetOutgoingPayment,
    GetOutgoingPaymentVariables
  >({
    query: gql`
      query GetOutgoingPayment($id: String!) {
        outgoingPayment(id: $id) {
          error
          id
          walletAddressId
          receiveAmount {
            assetCode
            assetScale
            value
          }
          receiver
          debitAmount {
            assetCode
            assetScale
            value
          }
          sentAmount {
            assetCode
            assetScale
            value
          }
          state
          stateAttempts
          liquidity
        }
      }
    `,
    variables: args
  })
  return response.data.outgoingPayment
}

export const listPayments = async (args: QueryPaymentsArgs) => {
  const response = await apolloClient.query<
    ListPaymentsQuery,
    ListPaymentsQueryVariables
  >({
    query: gql`
      query ListPaymentsQuery(
        $after: String
        $before: String
        $first: Int
        $last: Int
        $filter: PaymentFilter
      ) {
        payments(
          after: $after
          before: $before
          first: $first
          last: $last
          filter: $filter
        ) {
          edges {
            node {
              id
              type
              createdAt
            }
          }
          pageInfo {
            startCursor
            endCursor
            hasNextPage
            hasPreviousPage
          }
        }
      }
    `,
    variables: args
  })

  return response.data.payments
}

// TODO: refactor to payments (from asset)
// export const addAssetLiquidity = async (args: AddAssetLiquidityInput) => {
//   const response = await apolloClient.mutate<
//     AddAssetLiquidityMutation,
//     AddAssetLiquidityMutationVariables
//   >({
//     mutation: gql`
//       mutation AddAssetLiquidityMutation($input: AddAssetLiquidityInput!) {
//         addAssetLiquidity(input: $input) {
//           code
//           success
//           message
//           error
//         }
//       }
//     `,
//     variables: {
//       input: args
//     }
//   })

//   return response.data?.addAssetLiquidity
// }

// // TODO: refactor to payments (from asset)
// export const withdrawAssetLiquidity = async (
//   args: CreateAssetLiquidityWithdrawalInput
// ) => {
//   const response = await apolloClient.mutate<
//     WithdrawAssetLiquidity,
//     WithdrawAssetLiquidityVariables
//   >({
//     mutation: gql`
//       mutation WithdrawAssetLiquidity(
//         $input: CreateAssetLiquidityWithdrawalInput!
//       ) {
//         createAssetLiquidityWithdrawal(input: $input) {
//           code
//           success
//           message
//           error
//         }
//       }
//     `,
//     variables: {
//       input: args
//     }
//   })

//   return response.data?.createAssetLiquidityWithdrawal
// }
