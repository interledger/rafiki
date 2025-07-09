import { PaymentBody, PaymentEventBody } from './types'
import { IAppConfig } from '../config/app'
import { Deferred } from '../utils/deferred'
import { Logger } from 'pino'
import { paymentWaitMap } from './wait-map'

export class PaymentTimeoutError extends Error {
  statusCode = 504
  constructor(message = 'Timeout waiting for payment-event') {
    super(message)
  }
}

interface ServiceDependencies {
  logger: Logger
  config: IAppConfig
}

export interface PaymentService {
  create(payment: PaymentBody): Promise<PaymentEventBody>
}

export async function createPaymentService({
  logger,
  config
}: ServiceDependencies): Promise<PaymentService> {
  const log = logger.child({
    service: 'PaymentService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    config
  }
  return {
    create: (payment: PaymentBody) => handlePayment(deps, payment)
  }
}

async function handlePayment(
  deps: ServiceDependencies,
  payment: PaymentBody
): Promise<PaymentEventBody> {
  const { requestId } = payment
  try {
    const deferred = new Deferred<PaymentEventBody>()
    paymentWaitMap.set(requestId, deferred)
    // TODO: Initiate outgoing payment here

    const result = await waitForPaymentEvent(deps.config, deferred)
    paymentWaitMap.delete(requestId)
    if (!result) {
      deps.logger.debug('Unexpected missing result from timeout')
      throw new PaymentTimeoutError()
    }
    return result
  } catch (err) {
    paymentWaitMap.delete(requestId)
    if (err instanceof PaymentTimeoutError) throw err
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
      setTimeout(() => reject(new PaymentTimeoutError()), config.paymentTimeout)
    )
  ])
}
