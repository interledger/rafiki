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
  getQuote(
    quoteOptions: StartQuoteOptions,
    trx?: Transaction
  ): Promise<PaymentQuote>
  pay(payOptions: PayOptions): Promise<void>
}

export type PaymentMethod = 'ILP' | 'LOCAL'

export interface PaymentMethodHandlerService {
  getQuote(
    method: PaymentMethod,
    quoteOptions: StartQuoteOptions,
    trx?: Transaction
  ): Promise<PaymentQuote>
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
    getQuote: (method, quoteOptions, trx) =>
      paymentMethods[method].getQuote(quoteOptions, trx),
    pay: (method, payOptions) => paymentMethods[method].pay(payOptions)
  }
}
