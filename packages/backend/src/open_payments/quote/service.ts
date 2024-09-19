import { PartialModelGraph, TransactionOrKnex } from 'objection'
import * as Pay from '@interledger/pay'

import { BaseService } from '../../shared/baseService'
import { QuoteError, isQuoteError } from './errors'
import { Quote } from './model'
import { Amount } from '../amount'
import { ReceiverService } from '../receiver/service'
import { Receiver } from '../receiver/model'
import { GetOptions, ListOptions } from '../wallet_address/model'
import {
  WalletAddressService,
  WalletAddressSubresourceService
} from '../wallet_address/service'
import { PaymentMethodHandlerService } from '../../payment-method/handler/service'
import { IAppConfig } from '../../config/app'
import { FeeService } from '../../fee/service'
import { FeeType } from '../../fee/model'
import {
  PaymentMethodHandlerError,
  PaymentMethodHandlerErrorCode
} from '../../payment-method/handler/errors'

const MAX_INT64 = BigInt('9223372036854775807')

export interface QuoteService extends WalletAddressSubresourceService<Quote> {
  create(options: CreateQuoteOptions): Promise<Quote | QuoteError>
}

export interface ServiceDependencies extends BaseService {
  config: IAppConfig
  knex: TransactionOrKnex
  receiverService: ReceiverService
  walletAddressService: WalletAddressService
  feeService: FeeService
  paymentMethodHandlerService: PaymentMethodHandlerService
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
    getWalletAddressPage: (options) => getWalletAddressPage(deps, options)
  }
}

async function getQuote(
  deps: ServiceDependencies,
  options: GetOptions
): Promise<Quote | undefined> {
  return Quote.query(deps.knex)
    .get(options)
    .withGraphFetched('[asset, fee, walletAddress]')
}

interface QuoteOptionsBase {
  walletAddressId: string
  receiver: string
  method: 'ilp'
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
  const walletAddress = await deps.walletAddressService.get(
    options.walletAddressId
  )
  if (!walletAddress) {
    return QuoteError.UnknownWalletAddress
  }
  if (!walletAddress.isActive) {
    return QuoteError.InactiveWalletAddress
  }
  if (options.debitAmount) {
    if (
      options.debitAmount.value <= BigInt(0) ||
      options.debitAmount.assetCode !== walletAddress.asset.code ||
      options.debitAmount.assetScale !== walletAddress.asset.scale
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
    const paymentMethod = receiver.isLocal ? 'LOCAL' : 'ILP'
    const quote = await deps.paymentMethodHandlerService.getQuote(
      paymentMethod,
      {
        walletAddress,
        receiver,
        receiveAmount: options.receiveAmount,
        debitAmount: options.debitAmount
      }
    )

    const sendingFee = await deps.feeService.getLatestFee(
      walletAddress.assetId,
      FeeType.Sending
    )

    const graph: PartialModelGraph<Quote> = {
      walletAddressId: options.walletAddressId,
      assetId: walletAddress.assetId,
      receiver: options.receiver,
      debitAmount: quote.debitAmount,
      receiveAmount: quote.receiveAmount,
      expiresAt: new Date(0), // expiresAt is patched in finalizeQuote
      client: options.client,
      feeId: sendingFee?.id,
      estimatedExchangeRate: quote.estimatedExchangeRate
    }

    if (paymentMethod === 'ILP') {
      const maxPacketAmount = quote.additionalFields.maxPacketAmount as bigint
      graph.ilpQuoteDetails = {
        maxPacketAmount:
          MAX_INT64 < maxPacketAmount ? MAX_INT64 : maxPacketAmount, // Cap at MAX_INT64 because of postgres type limits.
        minExchangeRate: quote.additionalFields.minExchangeRate as Pay.Ratio,
        lowEstimatedExchangeRate: quote.additionalFields
          .lowEstimatedExchangeRate as Pay.Ratio,
        highEstimatedExchangeRate: quote.additionalFields
          .highEstimatedExchangeRate as Pay.PositiveRatio
      }
    }

    return await Quote.transaction(deps.knex, async (trx) => {
      const createdQuote = await Quote.query(trx)
        .insertGraphAndFetch(graph)
        .withGraphFetched('[asset, fee, walletAddress]')

      console.log({ createdQuote })

      return await finalizeQuote(
        {
          ...deps,
          knex: trx
        },
        options,
        createdQuote,
        receiver
      )
    })
  } catch (err) {
    if (isQuoteError(err)) {
      return err
    }

    if (
      err instanceof PaymentMethodHandlerError &&
      err.code === PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount
    ) {
      return QuoteError.NonPositiveReceiveAmount
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
    deps.logger.info(
      { receiver: options.receiver },
      'Could not create quote. Receiver not found'
    )
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
    deps.logger.info(
      {
        debitAmount: options.debitAmount,
        incomingAmount: receiver.incomingAmount
      },
      'Could not create quote. debitAmount or incomingAmount required.'
    )
    throw QuoteError.InvalidReceiver
  }
  return receiver
}

interface CalculateQuoteAmountsWithFeesResult {
  receiveAmountValue: bigint
  debitAmountValue: bigint
}

/**
 * Calculate fixed-send quote amounts: debitAmount is locked,
 * subtract fees (considering the exchange rate) from the receiveAmount.
 */
function calculateFixedSendQuoteAmounts(
  deps: ServiceDependencies,
  quote: Quote,
  maxReceiveAmountValue: bigint
): CalculateQuoteAmountsWithFeesResult {
  // TODO: rework to
  // debitAmount = 500
  // sourceAmount/debitAmountMinusFees = 500 - (500 * 0.02 + 100) = 390
  // receiveAmount = floor(debitAmountMinusFees * estimatedExchangeRate) = floor(390 * 0.91) = 354

  const fees = quote.fee?.calculate(quote.receiveAmount.value) ?? BigInt(0)

  const { estimatedExchangeRate } = quote

  const exchangeAdjustedFees = BigInt(
    Math.ceil(Number(fees) * estimatedExchangeRate)
  )
  const receiveAmountValue =
    BigInt(quote.receiveAmount.value) - exchangeAdjustedFees

  if (receiveAmountValue <= BigInt(0)) {
    deps.logger.info(
      { fees, exchangeAdjustedFees, estimatedExchangeRate, receiveAmountValue },
      'Negative receive amount when calculating quote amount'
    )
    throw QuoteError.NonPositiveReceiveAmount
  }

  if (receiveAmountValue > maxReceiveAmountValue) {
    throw QuoteError.InvalidAmount
  }

  deps.logger.debug(
    {
      'quote.receiveAmount.value': quote.receiveAmount.value,
      debitAmountValue: quote.debitAmount.value,
      receiveAmountValue,
      fees,
      exchangeAdjustedFees
    },
    'Calculated fixed-send quote amount with fees'
  )

  return {
    debitAmountValue: quote.debitAmount.value,
    receiveAmountValue
  }
}

// WIP: rework to
// debitAmount = 500
// sourceAmount/debitAmountMinusFees = 500 - (500 * 0.02 + 100) = 390
// receiveAmount = floor(debitAmountMinusFees * estimatedExchangeRate) = floor(390 * 0.91) = 354

// Problem: some quote tests are off by 1. changing calculate to floor/receive amount to floor (and every combo) didnt seem to fix it

// function calculateFixedSendQuoteAmounts(
//   deps: ServiceDependencies,
//   quote: Quote,
//   maxReceiveAmountValue: bigint
// ): CalculateQuoteAmountsWithFeesResult {
//   // TODO: rework to
//   // debitAmount = 500
//   // sourceAmount/debitAmountMinusFees = 500 - (500 * 0.02 + 100) = 390
//   // receiveAmount = floor(debitAmountMinusFees * estimatedExchangeRate) = floor(390 * 0.91) = 354

//   const fees = quote.fee?.calculate(quote.debitAmount.value) ?? BigInt(0)
//   const debitAmountMinusFees = quote.debitAmount.value - fees
//   const { estimatedExchangeRate } = quote
//   const receiveAmountValue = BigInt(
//     Math.floor(Number(debitAmountMinusFees) * estimatedExchangeRate)
//   )

//   // console.log({ estimatedExchangeRate })

//   // const exchangeAdjustedFees = BigInt(
//   //   Math.ceil(Number(fees) * estimatedExchangeRate)
//   // )
//   // const receiveAmountValue =
//   //   BigInt(quote.receiveAmount.value) - exchangeAdjustedFees

//   if (receiveAmountValue <= BigInt(0)) {
//     deps.logger.info(
//       { fees, estimatedExchangeRate, receiveAmountValue },
//       'Negative receive amount when calculating quote amount'
//     )
//     throw QuoteError.NonPositiveReceiveAmount
//   }

//   if (receiveAmountValue > maxReceiveAmountValue) {
//     throw QuoteError.InvalidAmount
//   }

//   deps.logger.debug(
//     {
//       'quote.receiveAmount.value': quote.receiveAmount.value,
//       debitAmountValue: quote.debitAmount.value,
//       receiveAmountValue,
//       fees
//       // exchangeAdjustedFees
//     },
//     'Calculated fixed-send quote amount with fees'
//   )

//   // what is the debit amount that satisfies the receiveAmount after fees
//   // - in my case, debitAmount of 500 includes fees. (answer is 390 in this case)

//   return {
//     debitAmountValue: quote.debitAmount.value,
//     receiveAmountValue
//   }
// }

/**
 * Calculate fixed-delivery quote amounts: receiveAmount is locked,
 * add fees to the the debitAmount.
 */
function calculateFixedDeliveryQuoteAmounts(
  deps: ServiceDependencies,
  quote: Quote
): CalculateQuoteAmountsWithFeesResult {
  const fees = quote.fee?.calculate(quote.debitAmount.value) ?? BigInt(0)

  const debitAmountValue = BigInt(quote.debitAmount.value) + fees

  if (debitAmountValue <= BigInt(0)) {
    deps.logger.info(
      { fees, debitAmountValue },
      'Received negative debitAmount receive amount when calculating quote amount'
    )
    throw QuoteError.InvalidAmount
  }

  deps.logger.debug(
    { debitAmountValue, receiveAmountValue: quote.receiveAmount.value, fees },
    `Calculated fixed-delivery quote amount with fees`
  )

  return {
    debitAmountValue,
    receiveAmountValue: quote.receiveAmount.value
  }
}

function calculateExpiry(
  deps: ServiceDependencies,
  quote: Quote,
  receiver: Receiver
): Date {
  const quoteExpiry = new Date(
    quote.createdAt.getTime() + deps.config.quoteLifespan
  )

  const incomingPaymentExpiresEarlier =
    receiver.incomingPayment?.expiresAt &&
    receiver.incomingPayment.expiresAt.getTime() < quoteExpiry.getTime()

  return incomingPaymentExpiresEarlier
    ? receiver.incomingPayment!.expiresAt!
    : quoteExpiry
}

async function finalizeQuote(
  deps: ServiceDependencies,
  options: CreateQuoteOptions,
  quote: Quote,
  receiver: Receiver
): Promise<Quote> {
  let maxReceiveAmountValue: bigint | undefined

  if (options.debitAmount) {
    const receivingPaymentValue =
      receiver.incomingAmount && receiver.receivedAmount
        ? receiver.incomingAmount.value - receiver.receivedAmount.value
        : undefined
    maxReceiveAmountValue =
      receivingPaymentValue && receivingPaymentValue < quote.receiveAmount.value
        ? receivingPaymentValue
        : quote.receiveAmount.value
  }

  deps.logger.debug(
    {
      debitAmountValue: quote.debitAmount.value,
      receiveAmountValue: quote.receiveAmount.value,
      maxReceiveAmountValue
    },
    `Calculating ${maxReceiveAmountValue ? 'fixed-send' : 'fixed-delivery'} quote amount with fees`
  )

  const { debitAmountValue, receiveAmountValue } = maxReceiveAmountValue
    ? calculateFixedSendQuoteAmounts(deps, quote, maxReceiveAmountValue)
    : calculateFixedDeliveryQuoteAmounts(deps, quote)

  const patchOptions = {
    sourceAmount: maxReceiveAmountValue
      ? // TODO: change fixed send to return the sourceAmount if I can get new calc working
        quote.debitAmount.value -
        (quote.fee?.calculate(quote.debitAmount.value) ?? 0n)
      : quote.debitAmount.value,
    debitAmountValue,
    receiveAmountValue,
    expiresAt: calculateExpiry(deps, quote, receiver)
  }

  await quote.$query(deps.knex).patch(patchOptions)

  return quote
}

async function getWalletAddressPage(
  deps: ServiceDependencies,
  options: ListOptions
): Promise<Quote[]> {
  return await Quote.query(deps.knex)
    .list(options)
    .withGraphFetched('[asset, fee, walletAddress]')
}
