import { createHmac } from 'crypto'
import { ModelObject, TransactionOrKnex } from 'objection'
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
import { Fee, FeeType } from '../../fee/model'
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
  return Quote.query(deps.knex)
    .get(options)
    .withGraphFetched('[asset, fee.asset]')
}

interface QuoteOptionsBase {
  paymentPointerId: string
  receiver: string
  client?: string
}

interface QuoteOptionsWithSendAmount extends QuoteOptionsBase {
  receiveAmount?: never
  sendAmount?: Amount
}

interface QuoteOptionsWithReceiveAmount extends QuoteOptionsBase {
  receiveAmount?: Amount
  sendAmount?: never
}

export type CreateQuoteOptions =
  | QuoteOptionsWithSendAmount
  | QuoteOptionsWithReceiveAmount

async function createQuote(
  deps: ServiceDependencies,
  options: CreateQuoteOptions
): Promise<Quote | QuoteError> {
  if (options.sendAmount && options.receiveAmount) {
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
  if (options.sendAmount) {
    if (
      options.sendAmount.value <= BigInt(0) ||
      options.sendAmount.assetCode !== paymentPointer.asset.code ||
      options.sendAmount.assetScale !== paymentPointer.asset.scale
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

    const quoteAssetId = paymentPointer.assetId
    const sendingFee = await deps.feeService.getLatestFee(
      quoteAssetId,
      FeeType.Sending
    )

    return await Quote.transaction(deps.knex, async (trx) => {
      const quote = await Quote.query(trx)
        .insertAndFetch({
          paymentPointerId: options.paymentPointerId,
          assetId: quoteAssetId,
          receiver: options.receiver,
          sendAmount: {
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
        .withGraphFetched('[asset, fee.asset]')

      let maxReceiveAmountValue: bigint | undefined
      if (options.sendAmount) {
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
  } else if (!options.sendAmount && !receiver.incomingAmount) {
    throw QuoteError.InvalidReceiver
  }
  return receiver
}

export interface StartQuoteOptions {
  paymentPointer: PaymentPointer
  sendAmount?: Amount
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
    if (options.sendAmount) {
      quoteOptions.amountToSend = options.sendAmount.value
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
    // Outgoing payments' sendAmount or receiveAmount should never be
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

function getFees(fee: Fee | undefined, principal: bigint): bigint {
  const basisPoints = fee?.basisPointFee ?? 0
  const fixedFee = fee?.fixedFee ?? 0n
  const feePercentage = basisPoints / 10_000

  // TODO: bigint/float multiplication
  return BigInt(Math.floor(Number(principal) * feePercentage)) + fixedFee
}

async function finalizeQuote(
  deps: ServiceDependencies,
  quote: Quote,
  receiver: Receiver,
  maxReceiveAmountValue?: bigint
): Promise<Quote> {
  let sendAmountValue = quote.sendAmount.value
  let receiveAmountValue = quote.receiveAmount.value

  if (!maxReceiveAmountValue) {
    // FixedDelivery
    const fees = getFees(quote.fee, sendAmountValue)
    sendAmountValue = BigInt(sendAmountValue) + fees
    if (
      receiveAmountValue !== quote.receiveAmount.value ||
      sendAmountValue < quote.sendAmount.value ||
      sendAmountValue <= BigInt(0)
    ) {
      throw QuoteError.InvalidAmount
    }
  } else {
    // FixedSend
    const fees = getFees(quote.fee, receiveAmountValue)
    receiveAmountValue = BigInt(receiveAmountValue) - fees

    if (receiveAmountValue <= fees) {
      throw new Error('Fees exceed quote receiveAmount') //TODO: refactor to quote error
    }

    if (
      sendAmountValue !== quote.sendAmount.value ||
      receiveAmountValue > maxReceiveAmountValue ||
      receiveAmountValue <= BigInt(0)
    ) {
      throw QuoteError.InvalidAmount
    }
  }

  const patchOptions = {
    sendAmountValue,
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

export function generateQuoteSignature(
  quote: ModelObject<Quote>,
  secret: string,
  version: number
): string {
  const timestamp = Math.round(new Date().getTime() / 1000)

  const payload = `${timestamp}.${quote}`
  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return `t=${timestamp}, v${version}=${digest}`
}

async function getPaymentPointerPage(
  deps: ServiceDependencies,
  options: ListOptions
): Promise<Quote[]> {
  return await Quote.query(deps.knex)
    .list(options)
    .withGraphFetched('[asset, fee.asset]')
}
