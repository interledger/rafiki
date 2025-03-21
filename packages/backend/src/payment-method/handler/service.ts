import { Amount } from '../../open_payments/amount'
import { OutgoingPayment } from '../../open_payments/payment/outgoing/model'
import { WalletAddress } from '../../open_payments/wallet_address/model'
import { Receiver } from '../../open_payments/receiver/model'
import { BaseService } from '../../shared/baseService'
import { IlpPaymentService } from '../ilp/service'
import { LocalPaymentService } from '../local/service'
import { Transaction } from 'objection'

export interface StartQuoteOptions {
  quoteId?: string
  walletAddress: WalletAddress
  debitAmount?: Amount
  receiveAmount?: Amount
  receiver: Receiver
}

export interface PaymentQuote {
  walletAddress: WalletAddress
  receiver: Receiver
  debitAmount: Amount
  receiveAmount: Amount
  estimatedExchangeRate: number
}

export interface PayOptions {
  receiver: Receiver
  outgoingPayment: OutgoingPayment
  finalDebitAmount: bigint
  finalReceiveAmount: bigint
}

export interface PaymentMethodService {
  getQuote(quoteOptions: StartQuoteOptions): Promise<{
    quote: PaymentQuote
    additionalDetails?: Record<string, any>
  }>
  saveAdditionalQuoteDetails?(
    trx: Transaction,
    additionalDetails: Record<string, any>
  ): Promise<void>
  pay(payOptions: PayOptions): Promise<void>
}

export type PaymentMethod = 'ILP' | 'LOCAL'

export interface PaymentMethodHandlerService {
  getQuote(
    method: PaymentMethod,
    quoteOptions: StartQuoteOptions
  ): Promise<{ quote: PaymentQuote; additionalDetails?: Record<string, any> }>
  saveAdditionalQuoteDetails(
    method: PaymentMethod,
    trx: Transaction,
    additionalDetails: Record<string, any>
  ): Promise<void>
  pay(method: PaymentMethod, payOptions: PayOptions): Promise<void>
}

interface ServiceDependencies extends BaseService {
  ilpPaymentService: IlpPaymentService
  localPaymentService: LocalPaymentService
}

export async function createPaymentMethodHandlerService({
  logger,
  knex,
  ilpPaymentService,
  localPaymentService
}: ServiceDependencies): Promise<PaymentMethodHandlerService> {
  const log = logger.child({
    service: 'PaymentMethodHandlerService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    ilpPaymentService,
    localPaymentService
  }

  const paymentMethods: { [key in PaymentMethod]: PaymentMethodService } = {
    ILP: deps.ilpPaymentService,
    LOCAL: deps.localPaymentService
  }

  return {
    getQuote: (method, quoteOptions) =>
      paymentMethods[method].getQuote(quoteOptions),

    saveAdditionalQuoteDetails: (method, trx, additionalDetails) => {
      const service = paymentMethods[method]
      if (service.saveAdditionalQuoteDetails) {
        return service.saveAdditionalQuoteDetails(trx, additionalDetails)
      }
      return Promise.resolve()
    },

    pay: (method, payOptions) => paymentMethods[method].pay(payOptions)
  }
}
