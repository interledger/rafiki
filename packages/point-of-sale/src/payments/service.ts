import { Logger } from 'pino'
import { CREATE_INCOMING_PAYMENT } from '../graphql/mutations/createIncomingPayment'
import { IAppConfig } from '../config/app'
import { ApolloClient, NormalizedCacheObject, gql } from '@apollo/client'
import {
  AmountInput,
  CreateIncomingPayment,
  CreateOutgoingPaymentFromIncomingPayment,
  CreateOutgoingPaymentFromIncomingPaymentVariables,
  CreateReceiver,
  CreateReceiverVariables,
  GetIncomingPaymentSenderAndAmount,
  GetIncomingPaymentSenderAndAmountVariables,
  GetWalletAddress,
  GetWalletAddressVariables,
  MutationCreateIncomingPaymentArgs,
  OutgoingPayment,
  Query,
  QueryWalletAddressByUrlArgs,
  GetWalletAddress,
  GetWalletAddressVariables
} from '../graphql/generated/graphql'
import { v4 } from 'uuid'
import { AxiosInstance, AxiosRequestConfig } from 'axios'
import { GET_WALLET_ADDRESS_BY_URL } from '../graphql/queries/getWalletAddress'
import { GetPaymentsQuery } from './routes'
import { GET_INCOMING_PAYMENT } from '../graphql/queries/getIncomingPayment'
import { CREATE_RECEIVER } from '../graphql/mutations/createReceiver'
import { CREATE_OUTGOING_PAYMENT_FROM_INCOMING_PAYMENT } from '../graphql/mutations/createOutgoingPaymentFromIncomingPayment'

type ServiceDependencies = {
  logger: Logger
  config: IAppConfig
  apolloClient: ApolloClient<NormalizedCacheObject>
  axios: AxiosInstance
}

type OpenPaymentsWalletAddress = {
  id: string
  publicName?: string
  assetCode: string
  assetScale: number
  authServer: string
  resourceServer: string
} & {
  [key: string]: unknown
}

export type WalletAddress = OpenPaymentsWalletAddress & {
  cardService: string
}

export type CreatedIncomingPayment = {
  id: string
  url: string
}

interface CreateIncomingPaymentArgs {
  walletAddressId: string
  incomingAmount: AmountInput
  senderWalletAddress: string
}

type IncomingPaymentPage = Exclude<
  Exclude<GetWalletAddress['walletAddressByUrl'], null>,
  undefined
>['incomingPayments']

export type PaymentService = {
  getIncomingPayments: (
    options: GetPaymentsQuery
  ) => Promise<IncomingPaymentPage>
  createIncomingPayment: (
    args: CreateIncomingPaymentArgs
  ) => Promise<CreatedIncomingPayment>
  getWalletAddress: (walletAddressUrl: string) => Promise<WalletAddress>
  getWalletAddressIdByUrl: (walletAddressUrl: string) => Promise<string>
  refundIncomingPayment: (
    incomingPaymentId: string,
    posWalletAddress: string
  ) => Promise<Partial<OutgoingPayment>>
}

export function createPaymentService(
  deps_: ServiceDependencies
): PaymentService {
  const logger = deps_.logger.child({
    service: 'PaymentService'
  })
  const deps = {
    ...deps_,
    logger
  }

  return {
    getIncomingPayments: (options: GetPaymentsQuery) =>
      getIncomingPayments(deps, options),
    createIncomingPayment: (args: CreateIncomingPaymentArgs) =>
      createIncomingPayment(deps, args),
    getWalletAddress: (walletAddressUrl: string) =>
      getWalletAddress(deps, walletAddressUrl),
    getWalletAddressIdByUrl: (walletAddressUrl: string) =>
      getWalletAddressIdByUrl(deps, walletAddressUrl),
    refundIncomingPayment: (
      incomingPaymentId: string,
      posWalletAddress: string
    ) => refundIncomingPayment(deps, incomingPaymentId, posWalletAddress)
  }
}

async function getIncomingPayments(
  deps: ServiceDependencies,
  options: GetPaymentsQuery
): Promise<IncomingPaymentPage> {
  const { receiverWalletAddress, ...restOfOptions } = options

  const client = deps.apolloClient
  const { data } = await client.query<
    GetWalletAddress,
    GetWalletAddressVariables
  >({
    query: GET_WALLET_ADDRESS_BY_URL,
    variables: {
      ...restOfOptions,
      url: receiverWalletAddress
    }
  })

  return data?.walletAddressByUrl?.incomingPayments
}

async function createIncomingPayment(
  deps: ServiceDependencies,
  args: CreateIncomingPaymentArgs
): Promise<CreatedIncomingPayment> {
  const { walletAddressId, incomingAmount, senderWalletAddress } = args
  const client = deps.apolloClient
  const expiresAt = new Date(
    Date.now() + deps.config.incomingPaymentExpiryMs
  ).toISOString()
  const { data } = await client.mutate<
    CreateIncomingPayment,
    MutationCreateIncomingPaymentArgs
  >({
    mutation: CREATE_INCOMING_PAYMENT,
    variables: {
      input: {
        walletAddressId,
        incomingAmount,
        idempotencyKey: v4(),
        isCardPayment: true,
        expiresAt,
        senderWalletAddress
      }
    }
  })

  const incomingPayment = data?.createIncomingPayment.payment
  if (!incomingPayment) {
    deps.logger.error(
      { walletAddressId },
      'Failed to create incoming payment for given walletAddressId'
    )
    throw new Error(
      `Failed to create incoming payment for given walletAddressId ${walletAddressId}`
    )
  }

  return incomingPayment
}

async function refundIncomingPayment(
  deps: ServiceDependencies,
  incomingPaymentId: string,
  posWalletAddress: string
): Promise<Partial<OutgoingPayment>> {
  const client = deps.apolloClient

  const getWalletAddressRes = await client.query<
    GetWalletAddress,
    GetWalletAddressVariables
  >({
    query: GET_WALLET_ADDRESS_BY_URL,
    variables: {
      url: posWalletAddress
    }
  })

  const walletAddress = getWalletAddressRes?.data?.walletAddressByUrl
  if (!walletAddress) {
    deps.logger.error(
      { incomingPaymentId, posWalletAddress },
      'Failed to refund incoming payment'
    )
    throw new Error('Failed to refund incoming payment')
  }

  const getIncomingPaymentRes = await client.query<
    GetIncomingPaymentSenderAndAmount,
    GetIncomingPaymentSenderAndAmountVariables
  >({
    query: GET_INCOMING_PAYMENT,
    variables: {
      id: incomingPaymentId
    }
  })

  const incomingPayment = getIncomingPaymentRes?.data?.incomingPayment
  if (
    !incomingPayment?.senderWalletAddress ||
    !incomingPayment.incomingAmount
  ) {
    deps.logger.error(
      { incomingPaymentId, posWalletAddress },
      'Failed to refund incoming payment'
    )
    throw new Error('Failed to refund incoming payment')
  }

  const createReceiverRes = await client.mutate<
    CreateReceiver,
    CreateReceiverVariables
  >({
    mutation: CREATE_RECEIVER,
    variables: {
      input: {
        walletAddressUrl: incomingPayment.senderWalletAddress,
        metadata: {
          incomingPaymentToRefund: incomingPayment.id
        }
      }
    }
  })

  const receiverResponse = createReceiverRes?.data?.createReceiver
  if (!receiverResponse?.receiver) {
    deps.logger.error(
      { posWalletAddress, incomingPaymentId },
      'Failed to refund incoming payment'
    )
    throw new Error('Failed to refund incoming payment')
  }

  const createOutgoingPaymentRes = await client.mutate<
    CreateOutgoingPaymentFromIncomingPayment,
    CreateOutgoingPaymentFromIncomingPaymentVariables
  >({
    mutation: CREATE_OUTGOING_PAYMENT_FROM_INCOMING_PAYMENT,
    variables: {
      input: {
        walletAddressId: walletAddress.id,
        incomingPayment: receiverResponse.receiver.id,
        debitAmount: {
          value: incomingPayment.incomingAmount.value,
          assetCode: incomingPayment.incomingAmount.assetCode,
          assetScale: incomingPayment.incomingAmount.assetScale
        }
      }
    }
  })

  if (
    !createOutgoingPaymentRes?.data?.createOutgoingPaymentFromIncomingPayment
      .payment
  ) {
    deps.logger.error(
      { incomingPaymentId },
      'Failed to refund incoming payment'
    )
    throw new Error('Failed to refund incoming payment')
  }

  return createOutgoingPaymentRes.data.createOutgoingPaymentFromIncomingPayment
    .payment
}

async function getWalletAddress(
  deps: ServiceDependencies,
  walletAddressUrl: string
): Promise<WalletAddress> {
  const config: AxiosRequestConfig = {
    headers: {
      Accept: 'application/json'
    }
  }
  const { data: walletAddress } = await deps.axios.get<
    OpenPaymentsWalletAddress | undefined
  >(walletAddressUrl, config)
  if (!walletAddress) {
    throw new Error('No wallet address was found')
  }
  if (
    !('cardService' in walletAddress) ||
    typeof walletAddress.cardService !== 'string'
  ) {
    throw new Error('Missing card service URL')
  }
  return walletAddress as WalletAddress
}

async function getWalletAddressIdByUrl(
  deps: ServiceDependencies,
  walletAddressUrl: string
): Promise<string> {
  const client = deps.apolloClient
  const { data } = await client.query<Query, QueryWalletAddressByUrlArgs>({
    variables: {
      url: walletAddressUrl
    },
    query: GET_WALLET_ADDRESS_BY_URL
  })
  if (!data?.walletAddressByUrl) {
    throw new Error('Wallet address not found')
  }
  return data.walletAddressByUrl.id
}
