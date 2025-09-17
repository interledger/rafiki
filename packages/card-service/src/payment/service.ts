import { PaymentBody, PaymentEventBody } from './types'
import { IAppConfig } from '../config/app'
import { Deferred } from '../utils/deferred'
import { paymentWaitMap } from './wait-map'
import { BaseService } from '../shared/baseService'
import {
  PaymentCreationFailedError,
  PaymentRouteError,
  PaymentTimeoutError,
  UnknownWalletAddressError
} from './errors'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import {
  Mutation,
  MutationCreateOutgoingPaymentFromIncomingPaymentArgs,
  Query,
  QueryWalletAddressByUrlArgs
} from '../graphql/generated/graphql'
import { CREATE_OUTGOING_PAYMENT_FROM_INCOMING } from '../graphql/mutations/createOutgoingPayment'
import { GET_WALLET_ADDRESS_BY_URL } from '../graphql/mutations/getWalletAddress'

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  apolloClient: ApolloClient<NormalizedCacheObject>
}

export interface PaymentService {
  create(payment: PaymentBody): Promise<PaymentEventBody>
}

export async function createPaymentService({
  logger,
  config,
  apolloClient
}: ServiceDependencies): Promise<PaymentService> {
  const log = logger.child({
    service: 'PaymentService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    config,
    apolloClient
  }
  return {
    create: (payment: PaymentBody) => handleCreatePayment(deps, payment)
  }
}

async function handleCreatePayment(
  deps: ServiceDependencies,
  payment: PaymentBody
): Promise<PaymentEventBody> {
  const { requestId } = payment
  try {
    const deferred = new Deferred<PaymentEventBody>()
    paymentWaitMap.set(requestId, deferred)
    const { data } = await deps.apolloClient.query<
      Query,
      QueryWalletAddressByUrlArgs
    >({
      query: GET_WALLET_ADDRESS_BY_URL,
      variables: {
        url: payment.card.walletAddress
      }
    })

    if (!data?.walletAddressByUrl) {
      throw new UnknownWalletAddressError()
    }
    const walletAddressId = data.walletAddressByUrl.id

    const outgoingPaymentFromIncomingPayment = await deps.apolloClient.mutate<
      Mutation,
      MutationCreateOutgoingPaymentFromIncomingPaymentArgs
    >({
      mutation: CREATE_OUTGOING_PAYMENT_FROM_INCOMING,
      variables: {
        input: {
          walletAddressId,
          incomingPayment: payment.incomingPaymentUrl,
          cardDetails: {
            signature: payment.card.signature
          }
        }
      }
    })

    if (!outgoingPaymentFromIncomingPayment?.data)
      throw new PaymentCreationFailedError()

    const result = await waitForPaymentEvent(deps.config, deferred)
    paymentWaitMap.delete(requestId)
    if (!result) {
      deps.logger.debug('Unexpected missing result from timeout')
      throw new PaymentTimeoutError()
    }
    return result
  } catch (err) {
    paymentWaitMap.delete(requestId)
    if (err instanceof PaymentRouteError) throw err
    throw new Error(
      err instanceof Error ? err.message : 'Internal server error'
    )
  }
}

async function waitForPaymentEvent(
  config: IAppConfig,
  deferred: Deferred<PaymentEventBody>
): Promise<PaymentEventBody | void> {
  return Promise.race([
    deferred.promise,
    new Promise<void>((_, reject) =>
      setTimeout(
        () => reject(new PaymentTimeoutError()),
        config.cardPaymentTimeoutMS
      )
    )
  ])
}
