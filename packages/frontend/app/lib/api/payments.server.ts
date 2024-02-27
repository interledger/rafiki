import { gql } from '@apollo/client'
import type {
  ListPaymentsQuery,
  ListPaymentsQueryVariables,
  WithdrawIncomingPaymentLiquidity,
  WithdrawIncomingPaymentLiquidityVariables,
  WithdrawIncomingPaymentLiquidityInput,
  WithdrawOutgoingPaymentLiquidity,
  WithdrawOutgoingPaymentLiquidityVariables,
  WithdrawOutgoingPaymentLiquidityInput,
  DepositOutgoingPaymentLiquidityInput,
  DepositOutgoingPaymentLiquidity,
  DepositOutgoingPaymentLiquidityVariables
} from '~/generated/graphql'
import {
  type QueryIncomingPaymentArgs,
  type QueryPaymentsArgs,
  type QueryOutgoingPaymentArgs,
  type GetIncomingPayment,
  type GetIncomingPaymentVariables,
  type GetOutgoingPaymentVariables,
  type GetOutgoingPayment
} from '~/generated/graphql'
import { getApolloClient } from '../apollo.server'

export const getIncomingPayment = async (
  args: QueryIncomingPaymentArgs,
  apiToken: string
) => {
  const apolloClient = getApolloClient(apiToken)
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

export const getOutgoingPayment = async (
  args: QueryOutgoingPaymentArgs,
  apiToken: string
) => {
  const apolloClient = getApolloClient(apiToken)
  const response = await apolloClient.query<
    GetOutgoingPayment,
    GetOutgoingPaymentVariables
  >({
    query: gql`
      query GetOutgoingPayment($id: String!) {
        outgoingPayment(id: $id) {
          id
          createdAt
          error
          receiver
          walletAddressId
          state
          metadata
          receiveAmount {
            assetCode
            assetScale
            value
          }
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
          liquidity
        }
      }
    `,
    variables: args
  })
  return response.data.outgoingPayment
}

export const listPayments = async (
  args: QueryPaymentsArgs,
  apiToken: string
) => {
  const apolloClient = getApolloClient(apiToken)
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
              state
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

export const depositOutgoingPaymentLiquidity = async (
  args: DepositOutgoingPaymentLiquidityInput,
  apiToken: string
) => {
  const apolloClient = getApolloClient(apiToken)
  const response = await apolloClient.mutate<
    DepositOutgoingPaymentLiquidity,
    DepositOutgoingPaymentLiquidityVariables
  >({
    mutation: gql`
      mutation DepositOutgoingPaymentLiquidity(
        $input: DepositOutgoingPaymentLiquidityInput!
      ) {
        depositOutgoingPaymentLiquidity(input: $input) {
          success
          message
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.depositOutgoingPaymentLiquidity
}

export const withdrawOutgoingPaymentLiquidity = async (
  args: WithdrawOutgoingPaymentLiquidityInput,
  apiToken: string
) => {
  const apolloClient = getApolloClient(apiToken)
  const response = await apolloClient.mutate<
    WithdrawOutgoingPaymentLiquidity,
    WithdrawOutgoingPaymentLiquidityVariables
  >({
    mutation: gql`
      mutation WithdrawOutgoingPaymentLiquidity(
        $input: WithdrawOutgoingPaymentLiquidityInput!
      ) {
        withdrawOutgoingPaymentLiquidity(input: $input) {
          success
          message
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.withdrawOutgoingPaymentLiquidity
}

export const withdrawIncomingPaymentLiquidity = async (
  args: WithdrawIncomingPaymentLiquidityInput,
  apiToken: string
) => {
  const apolloClient = getApolloClient(apiToken)
  const response = await apolloClient.mutate<
    WithdrawIncomingPaymentLiquidity,
    WithdrawIncomingPaymentLiquidityVariables
  >({
    mutation: gql`
      mutation WithdrawIncomingPaymentLiquidity(
        $input: WithdrawIncomingPaymentLiquidityInput!
      ) {
        withdrawIncomingPaymentLiquidity(input: $input) {
          success
          message
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.withdrawIncomingPaymentLiquidity
}
