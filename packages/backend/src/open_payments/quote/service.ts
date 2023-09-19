import { TransactionOrKnex } from 'objection'
import * as Pay from '@interledger/pay'

import { BaseService } from '../../shared/baseService'
import { QuoteError, isQuoteError } from './errors'
import { Quote } from './model'
import { Amount } from '../amount'
import { ReceiverService } from '../receiver/service'
import { Receiver } from '../receiver/model'
import {
  PaymentPointer,
  GetOptions,
  ListOptions
} from '../payment_pointer/model'
import {
  PaymentPointerService,
  PaymentPointerSubresourceService
} from '../payment_pointer/service'
import { RatesService } from '../../rates/service'
import { IlpPlugin, IlpPluginOptions } from '../../shared/ilp_plugin'
import { convertRatesToIlpPrices } from '../../rates/util'
import { FeeService } from '../../fee/service'
import { FeeType } from '../../fee/model'
import { IAppConfig } from '../../config/app'

const MAX_INT64 = BigInt('9223372036854775807')

export interface QuoteService extends PaymentPointerSubresourceService<Quote> {
  create(options: CreateQuoteOptions): Promise<Quote | QuoteError>
}

export interface ServiceDependencies extends BaseService {
  config: IAppConfig
  knex: TransactionOrKnex
  receiverService: ReceiverService
  paymentPointerService: PaymentPointerService
  ratesService: RatesService
  makeIlpPlugin: (options: IlpPluginOptions) => IlpPlugin
  feeService: FeeService
}

export async function createQuoteService(
  deps_: ServiceDependencies
): Promise<QuoteService> {
  const deps = {
    ...deps_,
    logger: deps_.logger.child({ service: 'QuoteService' })
  }
  return {
    get: (options) => getQuote(deps, options),
    create: (options: CreateQuoteOptions) => createQuote(deps, options),
    getPaymentPointerPage: (options) => getPaymentPointerPage(deps, options)
  }
}

async function getQuote(
  deps: ServiceDependencies,
  options: GetOptions
): Promise<Quote | undefined> {
  return Quote.query(deps.knex).get(options).withGraphFetched('[asset, fee]')
}

interface QuoteOptionsBase {
  paymentPointerId: string
  receiver: string
  client?: string
}

interface QuoteOptionsWithDebitAmount extends QuoteOptionsBase {
  receiveAmount?: never
  debitAmount?: Amount
}

interface QuoteOptionsWithReceiveAmount extends QuoteOptionsBase {
  receiveAmount?: Amount
  debitAmount?: never
}

export type CreateQuoteOptions =
  | QuoteOptionsWithDebitAmount
  | QuoteOptionsWithReceiveAmount

async function createQuote(
  deps: ServiceDependencies,
  options: CreateQuoteOptions
): Promise<Quote | QuoteError> {
  if (options.debitAmount && options.receiveAmount) {
    return QuoteError.InvalidAmount
  }
  const paymentPointer = await deps.paymentPointerService.get(
    options.paymentPointerId
  )
  if (!paymentPointer) {
    return QuoteError.UnknownPaymentPointer
  }
  if (!paymentPointer.isActive) {
    return QuoteError.InactivePaymentPointer
  }
  if (options.debitAmount) {
    if (
      options.debitAmount.value <= BigInt(0) ||
      options.debitAmount.assetCode !== paymentPointer.asset.code ||
      options.debitAmount.assetScale !== paymentPointer.asset.scale
    ) {
      return QuoteError.InvalidAmount
    }
  }
  if (options.receiveAmount) {
    if (options.receiveAmount.value <= BigInt(0)) {
      return QuoteError.InvalidAmount
    }
  }

  try {
    const receiver = await resolveReceiver(deps, options)
    const ilpQuote = await startQuote(deps, {
      ...options,
      paymentPointer,
      receiver
    })

    const sendingFee = await deps.feeService.getLatestFee(
      paymentPointer.assetId,
      FeeType.Sending
    )

    return await Quote.transaction(deps.knex, async (trx) => {
      const quote = await Quote.query(trx)
        .insertAndFetch({
          walletAddressId: options.paymentPointerId,
          assetId: paymentPointer.assetId,
          receiver: options.receiver,
          debitAmount: {
            value: ilpQuote.maxSourceAmount,
            assetCode: paymentPointer.asset.code,
            assetScale: paymentPointer.asset.scale
          },
          receiveAmount: {
            value: ilpQuote.minDeliveryAmount,
            assetCode: receiver.assetCode,
            assetScale: receiver.assetScale
          },
          // Cap at MAX_INT64 because of postgres type limits.
          maxPacketAmount:
            MAX_INT64 < ilpQuote.maxPacketAmount
              ? MAX_INT64
              : ilpQuote.maxPacketAmount,
          minExchangeRate: ilpQuote.minExchangeRate,
          lowEstimatedExchangeRate: ilpQuote.lowEstimatedExchangeRate,
          highEstimatedExchangeRate: ilpQuote.highEstimatedExchangeRate,
          // Patch using createdAt below
          expiresAt: new Date(0),
          client: options.client,
          feeId: sendingFee?.id
        })
        .withGraphFetched('[asset, fee]')

      let maxReceiveAmountValue: bigint | undefined
      if (options.debitAmount) {
        const receivingPaymentValue =
          receiver.incomingAmount && receiver.receivedAmount
            ? receiver.incomingAmount.value - receiver.receivedAmount.value
            : undefined
        maxReceiveAmountValue =
          receivingPaymentValue &&
          receivingPaymentValue < quote.receiveAmount.value
            ? receivingPaymentValue
            : quote.receiveAmount.value
      }

      return await finalizeQuote(
        {
          ...deps,
          knex: trx
        },
        quote,
        receiver,
        maxReceiveAmountValue
      )
    })
  } catch (err) {
    if (isQuoteError(err)) {
      return err
    }
    deps.logger.error({ err }, 'error creating a quote')
    throw err
  }
}

export async function resolveReceiver(
  deps: ServiceDependencies,
  options: CreateQuoteOptions
): Promise<Receiver> {
  const receiver = await deps.receiverService.get(options.receiver)
  if (!receiver) {
    throw QuoteError.InvalidReceiver
  }
  if (options.receiveAmount) {
    if (
      options.receiveAmount.assetScale !== receiver.assetScale ||
      options.receiveAmount.assetCode !== receiver.assetCode
    ) {
      throw QuoteError.InvalidAmount
    }
    if (receiver.incomingAmount && receiver.receivedAmount) {
      const receivingPaymentValue =
        receiver.incomingAmount.value - receiver.receivedAmount.value
      if (receivingPaymentValue < options.receiveAmount.value) {
        throw QuoteError.InvalidAmount
      }
    }
  } else if (!options.debitAmount && !receiver.incomingAmount) {
    throw QuoteError.InvalidReceiver
  }
  return receiver
}

export interface StartQuoteOptions {
  paymentPointer: PaymentPointer
  debitAmount?: Amount
  receiveAmount?: Amount
  receiver: Receiver
}

export async function startQuote(
  deps: ServiceDependencies,
  options: StartQuoteOptions
): Promise<Pay.Quote> {
  const rates = await deps.ratesService
    .rates(options.paymentPointer.asset.code)
    .catch((_err: Error) => {
      throw new Error('missing rates')
    })

  const plugin = deps.makeIlpPlugin({
    sourceAccount: options.paymentPointer,
    unfulfillable: true
  })

  try {
    await plugin.connect()
    const quoteOptions: Pay.QuoteOptions = {
      plugin,
      destination: options.receiver.toResolvedPayment(),
      sourceAsset: {
        scale: options.paymentPointer.asset.scale,
        code: options.paymentPointer.asset.code
      }
    }
    if (options.debitAmount) {
      quoteOptions.amountToSend = options.debitAmount.value
    } else {
      quoteOptions.amountToDeliver =
        options.receiveAmount?.value || options.receiver.incomingAmount?.value
    }
    const quote = await Pay.startQuote({
      ...quoteOptions,
      slippage: deps.config.slippage,
      prices: convertRatesToIlpPrices(rates)
    }).finally(() => {
      return Pay.closeConnection(
        quoteOptions.plugin,
        quoteOptions.destination
      ).catch((err) => {
        deps.logger.warn(
          {
            destination: quoteOptions.destination.destinationAddress,
            error: err.message
          },
          'close quote connection failed'
        )
      })
    })

    // Pay.startQuote should return PaymentError.InvalidSourceAmount or
    // PaymentError.InvalidDestinationAmount for non-positive amounts.
    // Outgoing payments' debitAmount or receiveAmount should never be
    // zero or negative.
    if (quote.maxSourceAmount <= BigInt(0)) {
      throw new Error()
    }

    if (quote.minDeliveryAmount <= BigInt(0)) {
      throw new Error()
    }

    return quote
  } finally {
    plugin.disconnect().catch((err: Error) => {
      deps.logger.warn({ error: err.message }, 'error disconnecting plugin')
    })
  }
}

async function finalizeQuote(
  deps: ServiceDependencies,
  quote: Quote,
  receiver: Receiver,
  maxReceiveAmountValue?: bigint
): Promise<Quote> {
  let debitAmountValue = quote.debitAmount.value
  let receiveAmountValue = quote.receiveAmount.value

  if (!maxReceiveAmountValue) {
    // FixedDelivery
    const fees = quote.fee?.calculate(debitAmountValue) ?? 0n
    debitAmountValue = BigInt(debitAmountValue) + fees
    if (
      debitAmountValue < quote.debitAmount.value ||
      debitAmountValue <= BigInt(0)
    ) {
      throw QuoteError.InvalidAmount
    }
  } else {
    // FixedSend
    const fees = quote.fee?.calculate(receiveAmountValue) ?? 0n
    const exchangeAdjustedFees = BigInt(
      Number(fees) * quote.lowEstimatedExchangeRate.valueOf()
    )
    receiveAmountValue = BigInt(receiveAmountValue) - exchangeAdjustedFees

    if (receiveAmountValue <= exchangeAdjustedFees) {
      throw QuoteError.NegativeReceiveAmount
    }

    if (
      receiveAmountValue > maxReceiveAmountValue ||
      receiveAmountValue <= BigInt(0)
    ) {
      throw QuoteError.InvalidAmount
    }
  }

  const patchOptions = {
    debitAmountValue,
    receiveAmountValue,
    expiresAt: new Date(quote.createdAt.getTime() + deps.config.quoteLifespan)
  }
  // Ensure a quotation's expiry date is not set past the expiry date of the receiver when the receiver is an incoming payment
  if (
    receiver.incomingPayment?.expiresAt &&
    receiver.incomingPayment?.expiresAt.getTime() <
      patchOptions.expiresAt.getTime()
  ) {
    patchOptions.expiresAt = receiver.incomingPayment.expiresAt
  }

  await quote.$query(deps.knex).patch(patchOptions)

  return quote
}

async function getPaymentPointerPage(
  deps: ServiceDependencies,
  options: ListOptions
): Promise<Quote[]> {
  return await Quote.query(deps.knex)
    .list(options)
    .withGraphFetched('[asset, fee]')
}
