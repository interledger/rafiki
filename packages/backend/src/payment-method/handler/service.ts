import { Amount } from '../../open_payments/amount'
import { OutgoingPayment } from '../../open_payments/payment/outgoing/model'
import { WalletAddress } from '../../open_payments/wallet_address/model'
import { Receiver } from '../../open_payments/receiver/model'
import { BaseService } from '../../shared/baseService'
import { IlpPaymentService } from '../ilp/service'
import { LocalPaymentService } from '../local/service'

export interface StartQuoteOptions {
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
  // TODO: make this an amount like debitAmount? update db field, handle conversion to num/denom, etc.
  // sourceAmount: bigint
  additionalFields: Record<string, unknown>
}

export interface PayOptions {
  receiver: Receiver
  outgoingPayment: OutgoingPayment
  finalDebitAmount: bigint
  finalReceiveAmount: bigint
}

export interface PaymentMethodService {
  getQuote(quoteOptions: StartQuoteOptions): Promise<PaymentQuote>
  pay(payOptions: PayOptions): Promise<void>
}

export type PaymentMethod = 'ILP' | 'LOCAL'

export interface PaymentMethodHandlerService {
  getQuote(
    method: PaymentMethod,
    quoteOptions: StartQuoteOptions
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
    getQuote: (method, quoteOptions) =>
      paymentMethods[method].getQuote(quoteOptions),
    pay: (method, payOptions) => paymentMethods[method].pay(payOptions)
  }
}
