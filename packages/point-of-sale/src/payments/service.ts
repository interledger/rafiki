import { Logger } from 'pino'
import { CREATE_INCOMING_PAYMENT } from '../graphql/mutations/createIncomingPayment'
import { IAppConfig } from '../config/app'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import {
  AmountInput,
  CreateIncomingPaymentInput,
  type Mutation
} from '../graphql/generated/graphql'
import { FnWithDeps } from '../shared/types'
import { v4 } from 'uuid'

type ServiceDependencies = {
  logger: Logger
  config: IAppConfig
  apolloClient: ApolloClient<NormalizedCacheObject>
}

type PaymentService = {
  createIncomingPayment: (
    walletAddressId: string,
    incomingAmount: AmountInput
  ) => Promise<string>
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
    ) => createIncomingPayment(deps, walletAddressId, incomingAmount)
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
      idempotencyKey: v4()
    }
  })

  const walletAddressUrl = data?.payment?.client
  if (!walletAddressUrl) {
    deps.logger.error(
      { walletAddressId },
      'Failed to create incoming payment for given walletAddressId'
    )
    throw new Error(
      `Failed to create incoming payment for given walletAddressId ${walletAddressId}`
    )
  }

  return walletAddressUrl
}
