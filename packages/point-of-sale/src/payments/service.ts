import { Logger } from 'pino'
import { CREATE_INCOMING_PAYMENT } from '../graphql/mutations/createIncomingPayment'
import { IAppConfig } from '../config/app'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import {
  AmountInput,
  CreateIncomingPaymentInput,
  IncomingPayment,
  type Mutation
} from '../graphql/generated/graphql'
import { FnWithDeps } from '../shared/types'
import { v4 } from 'uuid'
import { AxiosInstance, AxiosRequestConfig } from 'axios'

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

export type PaymentService = {
  createIncomingPayment: (
    walletAddressId: string,
    incomingAmount: AmountInput
  ) => Promise<IncomingPayment>
  getWalletAddress: (walletAddressUrl: string) => Promise<WalletAddress>
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
    createIncomingPayment: (
      walletAddressId: string,
      incomingAmount: AmountInput
    ) => createIncomingPayment(deps, walletAddressId, incomingAmount),
    getWalletAddress: (walletAddressUrl: string) =>
      getWalletAddress(deps, walletAddressUrl)
  }
}

const createIncomingPayment: FnWithDeps<
  ServiceDependencies,
  PaymentService['createIncomingPayment']
> = async (deps, walletAddressId, incomingAmount) => {
  const client = deps.apolloClient
  const { data } = await client.mutate<
    Mutation['createIncomingPayment'],
    CreateIncomingPaymentInput
  >({
    mutation: CREATE_INCOMING_PAYMENT,
    variables: {
      walletAddressId,
      incomingAmount,
      idempotencyKey: v4(),
      isCardPayment: true
    }
  })

  const incomingPayment = data?.payment
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
      'Content-Type': 'application/json'
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
