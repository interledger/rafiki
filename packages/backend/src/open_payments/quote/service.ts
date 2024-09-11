import { TransactionOrKnex } from 'objection'
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
import { TelemetryService } from '../../telemetry/service'
import { AssetService } from '../../asset/service'
import { OutgoingPayment } from '../payment/outgoing/model'
import { CacheDataStore } from '../../cache'

const MAX_INT64 = BigInt('9223372036854775807')

export type ToSetOn = OutgoingPayment | undefined

export interface QuoteService extends WalletAddressSubresourceService<Quote> {
  create(options: CreateQuoteOptions): Promise<Quote | QuoteError>
  setOn(obj: ToSetOn): Promise<void | Quote>
}

export interface ServiceDependencies extends BaseService {
  config: IAppConfig
  knex: TransactionOrKnex
  receiverService: ReceiverService
  walletAddressService: WalletAddressService
  feeService: FeeService
  paymentMethodHandlerService: PaymentMethodHandlerService
  assetService: AssetService
  cacheDataStore: CacheDataStore
  telemetry?: TelemetryService
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
    getWalletAddressPage: (options) => getQuotePage(deps, options),
    setOn: (toSetOn) => setQuoteOn(deps, toSetOn)
  }
}

async function getQuote(
  deps: ServiceDependencies,
  options: GetOptions
): Promise<Quote | undefined> {
  const quote = await Quote.query(deps.knex)
    .get(options)
    .withGraphFetched('[fee]')
  if (quote) {
    await deps.assetService.setOn(quote)
    await deps.walletAddressService.setOn(quote)
    await deps.assetService.setOn(quote.walletAddress)
  }
  return quote
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
  const stopTimer = deps.telemetry?.startTimer('quote_service_create_time_ms', {
    description: 'Time to create a quote'
  })
  if (options.debitAmount && options.receiveAmount) {
    stopTimer && stopTimer()
    return QuoteError.InvalidAmount
  }
  const walletAddress = await deps.walletAddressService.get(
    options.walletAddressId
  )
  if (!walletAddress) {
    stopTimer && stopTimer()
    return QuoteError.UnknownWalletAddress
  }
  if (!walletAddress.isActive) {
    stopTimer && stopTimer()
    return QuoteError.InactiveWalletAddress
  }
  if (options.debitAmount) {
    if (
      options.debitAmount.value <= BigInt(0) ||
      options.debitAmount.assetCode !== walletAddress.asset.code ||
      options.debitAmount.assetScale !== walletAddress.asset.scale
    ) {
      stopTimer && stopTimer()
      return QuoteError.InvalidAmount
    }
  }
  if (options.receiveAmount) {
    if (options.receiveAmount.value <= BigInt(0)) {
      stopTimer && stopTimer()
      return QuoteError.InvalidAmount
    }
  }

  try {
    const stopTimerReceiver = deps.telemetry?.startTimer(
      'quote_service_create_resolve_receiver_time_ms',
      {
        description: 'Time to resolve receiver'
      }
    )
    const receiver = await resolveReceiver(deps, options)
    stopTimerReceiver && stopTimerReceiver()

    const stopTimerQuote = deps.telemetry?.startTimer(
      'quote_service_create_get_quote_time_ms',
      {
        description: 'Time to getQuote'
      }
    )
    const quote = await deps.paymentMethodHandlerService.getQuote('ILP', {
      walletAddress,
      receiver,
      receiveAmount: options.receiveAmount,
      debitAmount: options.debitAmount
    })
    stopTimerQuote && stopTimerQuote()

    const maxPacketAmount = quote.additionalFields.maxPacketAmount as bigint

    const stopTimerFee = deps.telemetry?.startTimer(
      'quote_service_create_get_latest_fee_time_ms',
      {
        description: 'Time to getLatestFee'
      }
    )
    const sendingFee = await deps.feeService.getLatestFee(
      walletAddress.assetId,
      FeeType.Sending
    )
    stopTimerFee && stopTimerFee()

    return await Quote.transaction(deps.knex, async (trx) => {
      const createdQuote = await Quote.query(trx)
        .insertAndFetch({
          walletAddressId: options.walletAddressId,
          assetId: walletAddress.assetId,
          receiver: options.receiver,
          debitAmount: quote.debitAmount,
          receiveAmount: quote.receiveAmount,
          maxPacketAmount:
            MAX_INT64 < maxPacketAmount ? MAX_INT64 : maxPacketAmount, // Cap at MAX_INT64 because of postgres type limits.
          minExchangeRate: quote.additionalFields.minExchangeRate as Pay.Ratio,
          lowEstimatedExchangeRate: quote.additionalFields
            .lowEstimatedExchangeRate as Pay.Ratio,
          highEstimatedExchangeRate: quote.additionalFields
            .highEstimatedExchangeRate as Pay.PositiveRatio,
          expiresAt: new Date(0), // expiresAt is patched in finalizeQuote
          client: options.client,
          feeId: sendingFee?.id,
          estimatedExchangeRate: quote.estimatedExchangeRate
        })
        .withGraphFetched('[fee]')
      await deps.assetService.setOn(createdQuote)
      await deps.walletAddressService.setOn(createdQuote)
      await deps.assetService.setOn(createdQuote.walletAddress)

      const quoteFin = await finalizeQuote(
        {
          ...deps,
          knex: trx
        },
        options,
        createdQuote,
        receiver
      )
      await deps.cacheDataStore.set(quoteFin.id, quoteFin)
      stopTimer && stopTimer()

      return quoteFin
    })
  } catch (err) {
    if (isQuoteError(err)) {
      stopTimer && stopTimer()
      return err
    }

    if (
      err instanceof PaymentMethodHandlerError &&
      err.code === PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount
    ) {
      stopTimer && stopTimer()
      return QuoteError.NonPositiveReceiveAmount
    }

    deps.logger.error({ err }, 'error creating a quote')
    stopTimer && stopTimer()
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
  const fees = quote.fee?.calculate(quote.receiveAmount.value) ?? BigInt(0)

  const estimatedExchangeRate =
    quote.estimatedExchangeRate || quote.lowEstimatedExchangeRate.valueOf()

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
    debitAmountValue,
    receiveAmountValue,
    expiresAt: calculateExpiry(deps, quote, receiver)
  }

  await quote.$query(deps.knex).patch(patchOptions)
  await deps.cacheDataStore.delete(quote.id)

  return quote
}

async function getQuotePage(
  deps: ServiceDependencies,
  options: ListOptions
): Promise<Quote[]> {
  const quotePage = await Quote.query(deps.knex)
    .list(options)
    .withGraphFetched('[fee]')
  if (quotePage) {
    for (const quote of quotePage) {
      await deps.assetService.setOn(quote)
      await deps.walletAddressService.setOn(quote)
      await deps.assetService.setOn(quote.walletAddress)
    }
  }

  return quotePage
}

async function setQuoteOn(
  deps: ServiceDependencies,
  obj: ToSetOn
): Promise<void> {
  if (!obj) return
  const quote = await getQuote(deps, { id: obj.id })
  if (quote) obj.quote = quote
}
