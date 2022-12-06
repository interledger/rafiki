import axios from 'axios'
import { createHmac } from 'crypto'
import { ModelObject, TransactionOrKnex } from 'objection'
import * as Pay from '@interledger/pay'

import { BaseService } from '../../shared/baseService'
import { QuoteError, isQuoteError } from './errors'
import { Quote } from './model'
import { Amount, parseAmount } from '../amount'
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

const MAX_INT64 = BigInt('9223372036854775807')

export interface QuoteService extends PaymentPointerSubresourceService<Quote> {
  create(options: CreateQuoteOptions): Promise<Quote | QuoteError>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  slippage: number
  quoteUrl: string
  quoteLifespan: number // milliseconds
  signatureSecret?: string
  signatureVersion: number
  receiverService: ReceiverService
  paymentPointerService: PaymentPointerService
  ratesService: RatesService
  makeIlpPlugin: (options: IlpPluginOptions) => IlpPlugin
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
  return Quote.query(deps.knex).get(options).withGraphFetched('asset')
}

export interface CreateQuoteOptions {
  paymentPointerId: string
  sendAmount?: Amount
  receiveAmount?: Amount
  receiver: string
  clientId?: string
}

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
  if (options.sendAmount) {
    if (
      options.sendAmount.value <= BigInt(0) ||
      options.sendAmount.assetCode !== paymentPointer.asset.code ||
      options.sendAmount.assetScale !== paymentPointer.asset.scale
    ) {
      return QuoteError.InvalidAmount
    }
  } else if (options.receiveAmount) {
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

    return await Quote.transaction(deps.knex, async (trx) => {
      const quote = await Quote.query(trx)
        .insertAndFetch({
          paymentPointerId: options.paymentPointerId,
          assetId: paymentPointer.assetId,
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
          clientId: options.clientId
        })
        .withGraphFetched('asset')

      let maxReceiveAmountValue: bigint | undefined
      if (options.sendAmount) {
        const receivingPaymentValue = receiver.incomingAmount
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
    if (receiver.incomingAmount) {
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
  const prices = await deps.ratesService.prices().catch((_err: Error) => {
    throw new Error('missing prices')
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
        options.receiveAmount?.value || options.receiver.incomingAmount.value
    }
    const quote = await Pay.startQuote({
      ...quoteOptions,
      slippage: deps.slippage,
      prices
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

export async function finalizeQuote(
  deps: ServiceDependencies,
  quote: Quote,
  receiver: Receiver,
  maxReceiveAmountValue?: bigint
): Promise<Quote> {
  const requestHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }

  const body = {
    ...quote.toJSON(),
    paymentType: maxReceiveAmountValue
      ? Pay.PaymentType.FixedSend
      : Pay.PaymentType.FixedDelivery
  }

  if (deps.signatureSecret) {
    requestHeaders['Rafiki-Signature'] = generateQuoteSignature(
      body,
      deps.signatureSecret,
      deps.signatureVersion
    )
  }

  const res = await axios.post(deps.quoteUrl, body, {
    headers: requestHeaders,
    validateStatus: (status) => status === 201
  })

  // TODO: validate res.data is quote
  if (!res.data.sendAmount?.value || !res.data.receiveAmount?.value) {
    throw QuoteError.InvalidAmount
  }
  let sendAmount: Amount
  let receiveAmount: Amount
  try {
    sendAmount = parseAmount(res.data.sendAmount)
    receiveAmount = parseAmount(res.data.receiveAmount)
  } catch (_) {
    throw QuoteError.InvalidAmount
  }
  if (maxReceiveAmountValue) {
    if (
      sendAmount.value !== quote.sendAmount.value ||
      receiveAmount.value > maxReceiveAmountValue ||
      receiveAmount.value <= BigInt(0)
    ) {
      throw QuoteError.InvalidAmount
    }
  } else {
    if (
      receiveAmount.value !== quote.receiveAmount.value ||
      sendAmount.value < quote.sendAmount.value ||
      sendAmount.value <= BigInt(0)
    ) {
      throw QuoteError.InvalidAmount
    }
  }

  const patchOptions = {
    sendAmount,
    receiveAmount,
    expiresAt: new Date(quote.createdAt.getTime() + deps.quoteLifespan)
  }
  // Ensure a quotation's expiry date is not set past the expiry date of the receiver when the receiver is an incoming payment
  if (
    receiver.expiresAt &&
    receiver.expiresAt.getTime() < patchOptions.expiresAt.getTime()
  ) {
    patchOptions.expiresAt = receiver.expiresAt
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
  return await Quote.query(deps.knex).list(options).withGraphFetched('asset')
}
