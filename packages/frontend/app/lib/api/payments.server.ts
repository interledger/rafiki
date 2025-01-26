import { gql } from '@apollo/client'
import type {
  ListPaymentsQuery,
  ListPaymentsQueryVariables,
  CreateIncomingPaymentWithdrawal,
  CreateIncomingPaymentWithdrawalVariables,
  CreateIncomingPaymentWithdrawalInput,
  CreateOutgoingPaymentWithdrawal,
  CreateOutgoingPaymentWithdrawalVariables,
  CreateOutgoingPaymentWithdrawalInput,
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
  request: Request,
  args: QueryIncomingPaymentArgs
) => {
  const apolloClient = await getApolloClient(request)
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
  request: Request,
  args: QueryOutgoingPaymentArgs
) => {
  const apolloClient = await getApolloClient(request)
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
  request: Request,
  args: QueryPaymentsArgs
) => {
  const apolloClient = await getApolloClient(request)
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
  request: Request,
  args: DepositOutgoingPaymentLiquidityInput
) => {
  const apolloClient = await getApolloClient(request)
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
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.depositOutgoingPaymentLiquidity
}

export const createOutgoingPaymentWithdrawal = async (
  request: Request,
  args: CreateOutgoingPaymentWithdrawalInput
) => {
  const apolloClient = await getApolloClient(request)
  const response = await apolloClient.mutate<
    CreateOutgoingPaymentWithdrawal,
    CreateOutgoingPaymentWithdrawalVariables
  >({
    mutation: gql`
      mutation CreateOutgoingPaymentWithdrawal(
        $input: CreateOutgoingPaymentWithdrawalInput!
      ) {
        createOutgoingPaymentWithdrawal(input: $input) {
          success
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.createOutgoingPaymentWithdrawal
}

export const createIncomingPaymentWithdrawal = async (
  request: Request,
  args: CreateIncomingPaymentWithdrawalInput
) => {
  const apolloClient = await getApolloClient(request)
  const response = await apolloClient.mutate<
    CreateIncomingPaymentWithdrawal,
    CreateIncomingPaymentWithdrawalVariables
  >({
    mutation: gql`
      mutation CreateIncomingPaymentWithdrawal(
        $input: CreateIncomingPaymentWithdrawalInput!
      ) {
        createIncomingPaymentWithdrawal(input: $input) {
          success
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.createIncomingPaymentWithdrawal
}
