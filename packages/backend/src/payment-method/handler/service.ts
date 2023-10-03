import { Amount } from '../../open_payments/amount'
import { PaymentPointer } from '../../open_payments/payment_pointer/model'
import { Receiver } from '../../open_payments/receiver/model'
import { BaseService } from '../../shared/baseService'
import { IlpPaymentService } from '../ilp/service'

export interface StartQuoteOptions {
  paymentPointer: PaymentPointer
  debitAmount?: Amount
  receiveAmount?: Amount
  receiver: Receiver
}

export interface PaymentQuote {
  paymentPointer: PaymentPointer
  receiver: Receiver
  debitAmount: Amount
  receiveAmount: Amount
  additionalFields: Record<string, unknown>
}

export interface PaymentMethodService {
  getQuote(quoteOptions: StartQuoteOptions): Promise<PaymentQuote>
}

export type PaymentMethod = 'ILP'

export interface PaymentMethodHandlerService {
  getQuote(
    method: PaymentMethod,
    quoteOptions: StartQuoteOptions
  ): Promise<PaymentQuote>
}

interface ServiceDependencies extends BaseService {
  ilpPaymentService: IlpPaymentService
}

export async function createPaymentMethodHandlerService({
  logger,
  knex,
  ilpPaymentService
}: ServiceDependencies): Promise<PaymentMethodHandlerService> {
  const log = logger.child({
    service: 'PaymentMethodHandlerService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    ilpPaymentService
  }

  return {
    getQuote: (method, quoteOptions) =>
      getPaymentMethodService(deps, method).getQuote(quoteOptions)
  }
}

function getPaymentMethodService(
  deps: ServiceDependencies,
  method: PaymentMethod
): PaymentMethodService {
  if (method === 'ILP') {
    return deps.ilpPaymentService
  }

  throw new Error('Payment method not supported')
}
