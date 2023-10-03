import { Amount } from '../open_payments/amount'
import { PaymentPointer } from '../open_payments/payment_pointer/model'
import { Receiver } from '../open_payments/receiver/model'
import { BaseService } from '../shared/baseService'
import { IlpPaymentService } from './ilp/service'

export interface StartQuoteOptions {
  paymentPointer: PaymentPointer
  debitAmount?: Amount
  receiveAmount?: Amount
  receiver: Receiver
}

export type PaymentMethod = 'ILP'

export interface PaymentQuote {
  paymentPointer: PaymentPointer
  receiver: Receiver
  debitAmount: Amount
  receiveAmount: Amount
  additionalFields: Record<string, unknown>
}

export interface PaymentProcessorService {
  getQuote(quoteOptions: StartQuoteOptions): Promise<PaymentQuote>
}

export interface PaymentMethodManagerService {
  getQuote(
    method: PaymentMethod,
    quoteOptions: StartQuoteOptions
  ): Promise<PaymentQuote>
}

interface ServiceDependencies extends BaseService {
  ilpPaymentService: IlpPaymentService
}

export async function createPaymentMethodManagerService({
  logger,
  knex,
  ilpPaymentService
}: ServiceDependencies): Promise<PaymentMethodManagerService> {
  const log = logger.child({
    service: 'PaymentMethodManagerService'
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
): PaymentProcessorService {
  if (method === 'ILP') {
    return deps.ilpPaymentService
  }

  throw new Error('Payment method not supported')
}
