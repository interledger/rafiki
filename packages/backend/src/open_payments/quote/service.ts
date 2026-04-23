import { TransactionOrKnex } from 'objection'

import { BaseService } from '../../shared/baseService'
import { QuoteError, QuoteErrorCode, isQuoteError } from './errors'
import { Quote } from './model'
import { Amount } from '../amount'
import { ReceiverService } from '../receiver/service'
import { Receiver } from '../receiver/model'
import { GetOptions, ListOptions } from '../wallet_address/model'
import {
  WalletAddressService,
  WalletAddressSubresourceService
} from '../wallet_address/service'
import {
  PaymentMethodHandlerService,
  PaymentQuote
} from '../../payment-method/handler/service'
import { IAppConfig } from '../../config/app'
import { FeeService } from '../../fee/service'
import { Fee, FeeType } from '../../fee/model'
import {
  PaymentMethodHandlerError,
  PaymentMethodHandlerErrorCode
} from '../../payment-method/handler/errors'
import { v4 as uuid } from 'uuid'
import { TelemetryService } from '../../telemetry/service'
import { AssetService } from '../../asset/service'

export interface QuoteService extends WalletAddressSubresourceService<Quote> {
  create(options: CreateQuoteOptions): Promise<Quote | QuoteError>
}

export interface ServiceDependencies extends BaseService {
  config: IAppConfig
  knex: TransactionOrKnex
  receiverService: ReceiverService
  walletAddressService: WalletAddressService
  assetService: AssetService
  feeService: FeeService
  paymentMethodHandlerService: PaymentMethodHandlerService
  telemetry: TelemetryService
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
  const quote = await Quote.query(deps.knex)
    .modify((query) => {
      if (options.tenantId) {
        query.where({ tenantId: options.tenantId })
      }
    })
    .get(options)
  if (quote) {
    const asset = await deps.assetService.get(quote.assetId)
    if (asset) quote.asset = asset

    quote.walletAddress = await deps.walletAddressService.get(
      quote.walletAddressId,
      quote.tenantId
    )
  }
  return quote
}

interface QuoteOptionsBase {
  tenantId: string
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

interface UnfinalizedQuote {
  id: string
  tenantId: string
  walletAddressId: string
  assetId: string
  receiver: string
  debitAmount: Amount
  receiveAmount: Amount
  client: string | undefined
  feeId: string | undefined
  fee: Fee | undefined
  estimatedExchangeRate: number
}

async function createQuote(
  deps: ServiceDependencies,
  options: CreateQuoteOptions
): Promise<Quote | QuoteError> {
  const stopTimer = deps.telemetry.startTimer('quote_service_create_time_ms', {
    callName: 'QuoteService:create',
    description: 'Time to create a quote'
  })
  if (options.debitAmount && options.receiveAmount) {
    stopTimer()
    return new QuoteError(QuoteErrorCode.InvalidAmount)
  }
  const walletAddress = await deps.walletAddressService.get(
    options.walletAddressId,
    options.tenantId
  )
  if (!walletAddress) {
    stopTimer()
    return new QuoteError(QuoteErrorCode.UnknownWalletAddress)
  }
  if (!walletAddress.isActive) {
    stopTimer()
    return new QuoteError(QuoteErrorCode.InactiveWalletAddress)
  }
  if (options.debitAmount) {
    if (
      options.debitAmount.value <= BigInt(0) ||
      options.debitAmount.assetCode !== walletAddress.asset.code ||
      options.debitAmount.assetScale !== walletAddress.asset.scale
    ) {
      stopTimer()
      return new QuoteError(QuoteErrorCode.InvalidAmount)
    }
  }
  if (options.receiveAmount) {
    if (options.receiveAmount.value <= BigInt(0)) {
      stopTimer()
      return new QuoteError(QuoteErrorCode.InvalidAmount)
    }
  }

  try {
    const stopTimerReceiver = deps.telemetry.startTimer(
      'quote_service_create_resolve_receiver_time_ms',
      {
        callName: 'QuoteService:resolveReceiver',
        description: 'Time to resolve receiver'
      }
    )
    const receiver = await resolveReceiver(deps, options)
    stopTimerReceiver()

    const paymentMethod = receiver.isLocal ? 'LOCAL' : 'ILP'
    const quoteId = uuid()

    const stopTimerFee = deps.telemetry.startTimer(
      'quote_service_create_get_latest_fee_time_ms',
      {
        callName: 'FeeService:getLatestFee',
        description: 'Time to getLatestFee'
      }
    )
    const sendingFee = await deps.feeService.getLatestFee(
      walletAddress.assetId,
      FeeType.Sending
    )
    stopTimerFee()

    // Calculate fee for fixed debit amount
    // This is done before retrieving the payment quote because we need to
    // subtract the fee from the debit amount. The fee is added later
    // to the debit amount in the finalizeQuote function.
    let fixedDebitFee = 0n
    let quoteDebitAmount = options.debitAmount?.value ?? 0n
    if (options.debitAmount) {
      fixedDebitFee = sendingFee?.calculate(options.debitAmount.value) ?? 0n
      quoteDebitAmount = options.debitAmount.value - fixedDebitFee
      if (quoteDebitAmount <= 0n) {
        quoteDebitAmount = 0n
      }
    }

    const stopTimerQuote = deps.telemetry.startTimer(
      'quote_service_create_get_quote_time_ms',
      {
        callName: 'PaymentMethodHandlerService:getQuote',
        description: 'Time to getQuote'
      }
    )
    let quote: PaymentQuote
    try {
      quote = await deps.paymentMethodHandlerService.getQuote(paymentMethod, {
        quoteId,
        walletAddress,
        receiver,
        receiveAmount: options.receiveAmount,
        debitAmount: options.debitAmount
          ? {
              ...options.debitAmount,
              value: quoteDebitAmount
            }
          : undefined
      })
    } catch (err) {
      if (
        err instanceof PaymentMethodHandlerError &&
        err.code === PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount
      ) {
        let details = undefined

        if (err.details?.minSendAmount) {
          details = {
            minSendAmount: {
              value: 0n,
              assetCode: walletAddress.asset.code,
              assetScale: walletAddress.asset.scale
            }
          }
          const quoteMinSendAmount = err.details.minSendAmount as bigint

          details.minSendAmount.value = calculateMinSendAmount(
            quoteMinSendAmount,
            sendingFee
          )
        }

        stopTimer()
        return new QuoteError(QuoteErrorCode.NonPositiveReceiveAmount, details)
      }
      throw err
    }
    stopTimerQuote()

    // Calculate fee for fixed receive amount.
    // fixedReceiveFee is calculated if debitAmount is not provided.
    // This is done after retrieving the payment quote because we
    // don't know the peer's exchange rate in advance.
    const fixedReceiveFee = !options.debitAmount
      ? sendingFee?.calculate(quote.debitAmount.value) ?? 0n
      : 0n

    const unfinalizedQuote: UnfinalizedQuote = {
      id: quoteId,
      tenantId: options.tenantId,
      walletAddressId: options.walletAddressId,
      assetId: walletAddress.assetId,
      receiver: options.receiver,
      debitAmount: quote.debitAmount,
      receiveAmount: quote.receiveAmount,
      client: options.client,
      feeId: sendingFee?.id,
      fee: sendingFee,
      estimatedExchangeRate: quote.estimatedExchangeRate
    }

    const stopFinalize = deps.telemetry.startTimer(
      'quote_service_finalize_quote_ms',
      {
        callName: 'QuoteService:finalizedQuote',
        description: 'Time to finalize quote'
      }
    )
    const finalQuoteOptions = await finalizeQuote(
      deps,
      options,
      unfinalizedQuote,
      receiver,
      fixedDebitFee || fixedReceiveFee
    )
    stopFinalize()

    const stopQuoteCreate = deps.telemetry.startTimer(
      'quote_service_create_insert_time_ms',
      {
        callName: 'QuoteModel.insert',
        description: 'Time to insert quote'
      }
    )
    const createdQuote = await Quote.query(deps.knex).insertAndFetch({
      ...unfinalizedQuote,
      ...finalQuoteOptions
    })
    createdQuote.asset = walletAddress.asset
    createdQuote.walletAddress = walletAddress
    createdQuote.fee = sendingFee

    stopQuoteCreate()
    return createdQuote
  } catch (err) {
    if (isQuoteError(err)) {
      return err
    }
    deps.logger.error({ err }, 'error creating a quote')
    throw err
  } finally {
    stopTimer()
  }
}

export async function resolveReceiver(
  deps: ServiceDependencies,
  options: CreateQuoteOptions
): Promise<Receiver> {
  const receiver = await deps.receiverService.get(options.receiver)
  if (!receiver || !receiver.isActive()) {
    deps.logger.info(
      { receiver: options.receiver },
      'Could not create quote. Receiver not found'
    )
    throw new QuoteError(QuoteErrorCode.InvalidReceiver)
  }
  if (options.receiveAmount) {
    if (
      options.receiveAmount.assetScale !== receiver.assetScale ||
      options.receiveAmount.assetCode !== receiver.assetCode
    ) {
      throw new QuoteError(QuoteErrorCode.InvalidAmount)
    }
    if (receiver.incomingAmount && receiver.receivedAmount) {
      const receivingPaymentValue =
        receiver.incomingAmount.value - receiver.receivedAmount.value
      if (receivingPaymentValue < options.receiveAmount.value) {
        throw new QuoteError(QuoteErrorCode.InvalidAmount)
      }
    }
  } else if (!options.debitAmount && !receiver.incomingAmount) {
    deps.logger.info(
      {
        debitAmount: options.debitAmount,
        incomingAmount: receiver.incomingAmount
      },
      'Could not create quote. One of receiveAmount, debitAmount or incomingAmount (on the incoming payment) is required.'
    )
    throw new QuoteError(QuoteErrorCode.InvalidAmount)
  }
  return receiver
}

interface CalculateQuoteAmountsWithFeesResult {
  receiveAmountValue: bigint
  debitAmountValue: bigint
  debitAmountMinusFees: bigint
}

/**
 * Calculate fixed-send quote amounts: debitAmount from the unfinalized quote
 * does not include fees, here we add the fees to the debitAmount.
 */
function calculateFixedSendQuoteAmounts(
  deps: ServiceDependencies,
  quote: UnfinalizedQuote,
  maxReceiveAmountValue: bigint,
  fees: bigint
): CalculateQuoteAmountsWithFeesResult {
  const { estimatedExchangeRate } = quote
  const receiveAmountValue = quote.receiveAmount.value
  const debitAmountMinusFees = quote.debitAmount.value
  const debitAmountValue = quote.debitAmount.value + fees

  if (receiveAmountValue <= BigInt(0)) {
    deps.logger.info(
      { fees, estimatedExchangeRate, receiveAmountValue },
      'Negative receive amount when calculating quote amount'
    )
    throw new QuoteError(QuoteErrorCode.NonPositiveReceiveAmount)
  }

  if (receiveAmountValue > maxReceiveAmountValue) {
    throw new QuoteError(QuoteErrorCode.InvalidAmount)
  }

  deps.logger.debug(
    {
      'quote.receiveAmount.value': quote.receiveAmount.value,
      debitAmountValue,
      debitAmountMinusFees,
      receiveAmountValue,
      fees
    },
    'Calculated fixed-send quote amount with fees'
  )

  return {
    debitAmountValue,
    debitAmountMinusFees,
    receiveAmountValue
  }
}

function calculateExpiry(deps: ServiceDependencies, receiver: Receiver): Date {
  const quoteExpiry = new Date(Date.now() + deps.config.quoteLifespan)

  const incomingPaymentExpiresEarlier =
    receiver.incomingPayment?.expiresAt &&
    receiver.incomingPayment.expiresAt.getTime() < quoteExpiry.getTime()

  return incomingPaymentExpiresEarlier
    ? receiver.incomingPayment!.expiresAt!
    : quoteExpiry
}

interface QuotePatchOptions {
  debitAmountMinusFees: bigint
  debitAmountValue: bigint
  receiveAmountValue: bigint
  expiresAt: Date
}

/**
 * Calculate fixed-delivery quote amounts: receiveAmount is locked,
 * add fees to the the debitAmount.
 */
function calculateFixedDeliveryQuoteAmounts(
  deps: ServiceDependencies,
  quote: UnfinalizedQuote,
  fees: bigint
): CalculateQuoteAmountsWithFeesResult {
  const debitAmountValue = quote.debitAmount.value + fees
  const debitAmountMinusFees = quote.debitAmount.value
  const receiveAmountValue = quote.receiveAmount.value

  if (debitAmountValue <= BigInt(0)) {
    deps.logger.info(
      { fees, debitAmountValue },
      'Received negative debitAmount receive amount when calculating quote amount'
    )
    throw new QuoteError(QuoteErrorCode.InvalidAmount)
  }

  deps.logger.debug(
    { debitAmountValue, receiveAmountValue, fees: fees },
    `Calculated fixed-delivery quote amount with fees`
  )

  return {
    debitAmountValue,
    debitAmountMinusFees,
    receiveAmountValue
  }
}

async function finalizeQuote(
  deps: ServiceDependencies,
  options: CreateQuoteOptions,
  quote: UnfinalizedQuote,
  receiver: Receiver,
  sendingFees: bigint
): Promise<QuotePatchOptions> {
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

  const { debitAmountValue, debitAmountMinusFees, receiveAmountValue } =
    maxReceiveAmountValue
      ? calculateFixedSendQuoteAmounts(
          deps,
          quote,
          maxReceiveAmountValue,
          sendingFees
        )
      : calculateFixedDeliveryQuoteAmounts(deps, quote, sendingFees)

  const patchOptions = {
    debitAmountMinusFees,
    debitAmountValue,
    receiveAmountValue,
    expiresAt: calculateExpiry(deps, receiver)
  }

  return patchOptions
}

async function getWalletAddressPage(
  deps: ServiceDependencies,
  options: ListOptions
): Promise<Quote[]> {
  const quotes = await Quote.query(deps.knex)
    .modify((query) => {
      if (options.tenantId) {
        query.where({ tenantId: options.tenantId })
      }
    })
    .list(options)
  for (const quote of quotes) {
    const asset = await deps.assetService.get(quote.assetId)
    if (asset) quote.asset = asset

    quote.walletAddress = await deps.walletAddressService.get(
      quote.walletAddressId,
      quote.tenantId
    )
  }
  return quotes
}

function calculateMinSendAmount(
  quoteMinSendAmount: bigint,
  sendingFee: Fee | undefined
): bigint {
  if (!sendingFee) {
    return quoteMinSendAmount
  }
  const fixedFee = sendingFee.fixedFee ?? 0n
  // if the fee is 0%, the invertedPercentageFee is 1
  // if the fee is 100%, the invertedPercentageFee is 0, which is not allowed
  // We make sure the fee is between 0 and 1
  const invertedPercentageFee =
    1 - Math.min(Math.max((sendingFee.basisPointFee ?? 0) / 10_000, 0), 1)

  return BigInt(
    Math.ceil(Number(quoteMinSendAmount + fixedFee) / invertedPercentageFee)
  )
}
