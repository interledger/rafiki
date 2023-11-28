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
    const quote = await deps.paymentMethodHandlerService.getQuote('ILP', {
      walletAddress,
      receiver,
      receiveAmount: options.receiveAmount,
      debitAmount: options.debitAmount
    })

    const maxPacketAmount = quote.additionalFields.maxPacketAmount as bigint

    const sendingFee = await deps.feeService.getLatestFee(
      walletAddress.assetId,
      FeeType.Sending
    )

    return await Quote.transaction(deps.knex, async (trx) => {
      const createdQuote = await Quote.query(trx)
        .insertAndFetch({
          walletAddressId: options.walletAddressId,
          assetId: walletAddress.assetId,
          receiver: options.receiver,
          debitAmount: quote.debitAmount,
          receiveAmount: quote.receiveAmount,
          // Cap at MAX_INT64 because of postgres type limits.
          maxPacketAmount:
            MAX_INT64 < maxPacketAmount ? MAX_INT64 : maxPacketAmount,
          minExchangeRate: quote.additionalFields.minExchangeRate as Pay.Ratio,
          lowEstimatedExchangeRate: quote.additionalFields
            .lowEstimatedExchangeRate as Pay.Ratio,
          highEstimatedExchangeRate: quote.additionalFields
            .highEstimatedExchangeRate as Pay.PositiveRatio,
          // Patch using createdAt below
          expiresAt: new Date(0),
          client: options.client,
          feeId: sendingFee?.id,
          estimatedExchangeRate: quote.estimatedExchangeRate,
          additionalFields: quote.additionalFields
        })
        .withGraphFetched('[asset, fee, walletAddress]')

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

interface CalculateQuoteAmountsAfterFeesResult {
  receiveAmountValue: bigint
  debitAmountValue: bigint
}

function calculateQuoteAmountsAfterFees(
  deps: ServiceDependencies,
  quote: Quote,
  maxReceiveAmountValue?: bigint
): CalculateQuoteAmountsAfterFeesResult {
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
    const estimatedExchangeRate =
      quote.estimatedExchangeRate || quote.lowEstimatedExchangeRate.valueOf()

    const exchangeAdjustedFees = BigInt(
      Math.ceil(Number(fees) * estimatedExchangeRate)
    )
    receiveAmountValue -= exchangeAdjustedFees

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

  return {
    receiveAmountValue,
    debitAmountValue
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

export async function finalizeQuote(
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

  const { debitAmountValue, receiveAmountValue } =
    calculateQuoteAmountsAfterFees(deps, quote, maxReceiveAmountValue)

  const patchOptions = {
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
