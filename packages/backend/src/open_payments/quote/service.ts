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
import { convertRatesToIlpPrices } from '../../rates/util'
import { FeeService } from '../../fee/service'
import { FeeType } from '../../fee/model'

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
  return Quote.query(deps.knex).get(options).withGraphFetched('asset')
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
          client: options.client
        })
        .withGraphFetched('asset')

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
      slippage: deps.slippage,
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

type QuoteHeaders = {
  Accept: string
  'Content-Type': string
  'Rafiki-Signature'?: string
}

export async function finalizeQuote(
  deps: ServiceDependencies,
  quote: Quote,
  receiver: Receiver,
  maxReceiveAmountValue?: bigint
): Promise<Quote> {
  const requestHeaders: QuoteHeaders = {
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
    receiver.incomingPayment?.expiresAt &&
    receiver.incomingPayment?.expiresAt.getTime() <
      patchOptions.expiresAt.getTime()
  ) {
    patchOptions.expiresAt = receiver.incomingPayment.expiresAt
  }

  await quote.$query(deps.knex).patch(patchOptions)

  return quote
}

async function finalizeQuoteWIP(
  deps: ServiceDependencies,
  quote: Quote,
  receiver: Receiver,
  maxReceiveAmountValue?: bigint
): Promise<Quote> {
  const {
    quote: updatedQuote,
    receiveFeeAmount,
    sendFeeAmount
  } = await calculateAmounts(deps, quote)
  const { sendAmount, receiveAmount } = updatedQuote

  // TODO: do i still need to do any of these checks? maxReceiveAmountValue? if values are send/receiveAmount.value is defined/not 0?

  // TODO: validate res.data is quote
  // if (!send.value || !receive.value) {
  //   throw QuoteError.InvalidAmount
  // }
  // let sendAmount: Amount
  // let receiveAmount: Amount
  // try {
  //   sendAmount = parseAmount(send)
  //   receiveAmount = parseAmount(receive)
  // } catch (_) {
  //   throw QuoteError.InvalidAmount
  // }
  // if (maxReceiveAmountValue) {
  //   if (
  //     sendAmount.value !== quote.sendAmount.value ||
  //     receiveAmount.value > maxReceiveAmountValue ||
  //     receiveAmount.value <= BigInt(0)
  //   ) {
  //     throw QuoteError.InvalidAmount
  //   }
  // } else {
  //   if (
  //     receiveAmount.value !== quote.receiveAmount.value ||
  //     sendAmount.value < quote.sendAmount.value ||
  //     sendAmount.value <= BigInt(0)
  //   ) {
  //     throw QuoteError.InvalidAmount
  //   }
  // }

  const patchOptions = {
    sendAmount,
    receiveAmount,
    expiresAt: new Date(quote.createdAt.getTime() + deps.quoteLifespan)
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

// export async function action({ request }: ActionArgs) {
//   const receivedQuote: Quote = await request.json()

//   const fee = CONFIG.seed.sendingFee
//   const supportedAssets = CONFIG.seed.assets.map(({ code }) => code)

//   if (receivedQuote.paymentType == PaymentType.FixedDelivery) {
//     // TODO: handle quote fee calculation for different assets
//     if (!supportedAssets.includes(receivedQuote.sendAmount.assetCode)) {
//       throw json('Invalid quote sendAmount asset', { status: 400 })
//     }
//     const sendAmountValue = BigInt(receivedQuote.sendAmount.value)
//     const fees =
//       // TODO: bigint/float multiplication
//       BigInt(Math.floor(Number(sendAmountValue) * fee.percentage)) +
//       BigInt(fee.fixed * Math.pow(10, receivedQuote.sendAmount.assetScale))

//     receivedQuote.sendAmount.value = (sendAmountValue + fees).toString()
//   } else if (receivedQuote.paymentType === PaymentType.FixedSend) {
//     if (!supportedAssets.includes(receivedQuote.receiveAmount.assetCode)) {
//       throw json('Invalid quote receiveAmount asset', { status: 400 })
//     }
//     const receiveAmountValue = BigInt(receivedQuote.receiveAmount.value)
//     const fees =
//       BigInt(Math.floor(Number(receiveAmountValue) * fee.percentage)) +
//       BigInt(fee.fixed * Math.pow(10, receivedQuote.receiveAmount.assetScale))

//     if (receiveAmountValue <= fees) {
//       throw json('Fees exceed quote receiveAmount', { status: 400 })
//     }

//     receivedQuote.receiveAmount.value = (receiveAmountValue - fees).toString()
//   } else throw json('Invalid paymentType', { status: 400 })

//   return json(receivedQuote, { status: 201 })
// }

async function calculateAmounts(deps: ServiceDependencies, quote: Quote) {
  const receivingFee = await deps.feeService.getLatestFee(
    quote.assetId,
    FeeType.Receiving
  )
  const sendingFee = await deps.feeService.getLatestFee(
    quote.assetId,
    FeeType.Sending
  )

  if (!receivingFee && !sendingFee) throw Error('Invalid fee configuration') // TODO: refactor to quote error

  // TODO: where to get this? or can rm?
  // const supportedAssets = CONFIG.seed.assets.map(({ code }) => code)

  let receiveFeeAmount: Amount | null = null
  let sendFeeAmount: Amount | null = null

  if (receivingFee) {
    // if (!supportedAssets.includes(quote.sendAmount.assetCode)) {
    //   throw new Error('Invalid quote sendAmount asset') //TODO: refactor to quote error
    // }
    const sendAmountValue = BigInt(quote.sendAmount.value)
    // TODO: avoid float? Pay.Ratio ?
    const feePercentage = receivingFee.basisPointFee / 10_000
    const fees =
      // TODO: bigint/float multiplication
      BigInt(Math.floor(Number(sendAmountValue) * feePercentage)) +
      BigInt(
        Number(receivingFee.fixedFee) * Math.pow(10, receivingFee.asset.scale)
      )
    quote.sendAmount.value = sendAmountValue + fees
    receiveFeeAmount = {
      value: fees,
      assetScale: receivingFee.asset.scale,
      assetCode: receivingFee.asset.code
    }
  }
  // TODO: what if there are sending AND receiving fees? previously that wasnt possible.
  // Are the fee values and send/receive amounts correct here when there are fees for both?
  if (sendingFee) {
    // if (!supportedAssets.includes(quote.receiveAmount.assetCode)) {
    //   throw new Error('Invalid quote receiveAmount asset') //TODO: refactor to quote error
    // }
    const receiveAmountValue = BigInt(quote.receiveAmount.value)
    // TODO: avoid float? Pay.Ratio ?
    const feePercentage = sendingFee.basisPointFee / 10_000
    const fees =
      BigInt(Math.floor(Number(receiveAmountValue) * feePercentage)) +
      BigInt(Number(sendingFee.fixedFee) * Math.pow(10, sendingFee.asset.scale))

    if (receiveAmountValue <= fees) {
      throw new Error('Fees exceed quote receiveAmount') //TODO: refactor to quote error
    }

    quote.receiveAmount.value = receiveAmountValue - fees
    sendFeeAmount = {
      value: fees,
      assetScale: sendingFee.asset.scale,
      assetCode: sendingFee.asset.code
    }
  }

  return { quote, receiveFeeAmount, sendFeeAmount }
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
