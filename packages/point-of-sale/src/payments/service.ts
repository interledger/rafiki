import { Logger } from 'pino'
import { CREATE_INCOMING_PAYMENT } from '../graphql/mutations/createIncomingPayment'
import { IAppConfig } from '../config/app'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import {
  AmountInput,
  CreateIncomingPayment,
  MutationCreateIncomingPaymentArgs,
  Query,
  QueryWalletAddressByUrlArgs,
  GetWalletAddress,
  GetWalletAddressVariables
} from '../graphql/generated/graphql'
import { FnWithDeps } from '../shared/types'
import { v4 } from 'uuid'
import { AxiosInstance, AxiosRequestConfig } from 'axios'
import { GET_WALLET_ADDRESS_BY_URL } from '../graphql/queries/getWalletAddress'
import { GetPaymentsQuery } from './routes'

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

type IncomingPaymentPage = Exclude<
  Exclude<GetWalletAddress['walletAddressByUrl'], null>,
  undefined
>['incomingPayments']

export type PaymentService = {
  getIncomingPayments: (
    options: GetPaymentsQuery
  ) => Promise<IncomingPaymentPage>
  createIncomingPayment: (
    walletAddressId: string,
    incomingAmount: AmountInput
  ) => Promise<CreatedIncomingPayment>
  getWalletAddress: (walletAddressUrl: string) => Promise<WalletAddress>
  getWalletAddressIdByUrl: (walletAddressUrl: string) => Promise<string>
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
    createIncomingPayment: (
      walletAddressId: string,
      incomingAmount: AmountInput
    ) => createIncomingPayment(deps, walletAddressId, incomingAmount),
    getWalletAddress: (walletAddressUrl: string) =>
      getWalletAddress(deps, walletAddressUrl),
    getWalletAddressIdByUrl: (walletAddressUrl: string) =>
      getWalletAddressIdByUrl(deps, walletAddressUrl)
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

const createIncomingPayment: FnWithDeps<
  ServiceDependencies,
  PaymentService['createIncomingPayment']
> = async (deps, walletAddressId, incomingAmount) => {
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
        expiresAt
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
