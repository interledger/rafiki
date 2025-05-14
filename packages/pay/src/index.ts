import { AssetDetails, isValidAssetDetails } from './controllers/asset-details'
import { Counter } from './controllers/sequence'
import {
  fetchPaymentDetails,
  PaymentDestination,
  Amount
} from './open-payments'
import { Plugin } from './request'
import { AssetProbe } from './senders/asset-probe'
import { ConnectionCloser } from './senders/connection-closer'
import { PaymentSender, PaymentType } from './senders/payment'
import { RateProbe } from './senders/rate-probe'
import {
  Int,
  isNonNegativeRational,
  NonNegativeRational,
  PositiveInt,
  PositiveRatio,
  Ratio
} from './utils'

export { IncomingPayment } from './open-payments'
export { AccountUrl } from './payment-pointer'
export {
  Int,
  PositiveInt,
  PositiveRatio,
  Ratio,
  Counter,
  PaymentType,
  AssetDetails
}

/** Recipient-provided details to resolve payment parameters, and connected ILP uplink */
export interface SetupOptions {
  /** Plugin to send ILP packets over the network */
  plugin: Plugin
  /** Payment pointer, Open Payments or SPSP account URL to query STREAM connection credentials */
  destinationAccount?: string
  /** Open Payments Incoming Payment URL to resolve details and credentials to pay a fixed-delivery payment */
  destinationPayment?: string
  /** Open Payments Connection URL to resolve STREAM connection credentials */
  destinationConnection?: string
  /** Fixed amount to deliver to the recipient, in base units of destination asset */
  amountToDeliver?: Amount
  /** For testing purposes: symmetric key to encrypt STREAM messages. Requires `destinationAddress` */
  sharedSecret?: Uint8Array
  /** For testing purposes: ILP address of the STREAM receiver to send outgoing packets. Requires `sharedSecret` */
  destinationAddress?: string
  /** For testing purposes: asset details of the STREAM recipient, overriding STREAM and Incoming Payment. Requires `destinationAddress` */
  destinationAsset?: AssetDetails
}

/** Resolved destination details of a proposed payment, such as the destination asset, Incoming Payment, and STREAM credentials, ready to perform a quote */
export interface ResolvedPayment extends PaymentDestination {
  /** Asset and denomination of the receiver's Interedger account */
  destinationAsset: AssetDetails
  /** Strict counter of how many packets have been sent, to safely resume a connection */
  requestCounter: Counter
}

/** Limits and target to quote a payment and probe the rate */
export interface QuoteOptions {
  /** Plugin to send ILP packets over the network */
  plugin: Plugin
  /** Resolved destination details of the payment to establish connection with recipient */
  destination: ResolvedPayment
  /** Asset and denomination of the sending account */
  sourceAsset?: AssetDetails
  /** Fixed amount to send to the recipient, in base units of source asset */
  amountToSend?: Int | string | number | bigint
  /** Fixed amount to deliver to the recipient, in base units of destination asset */
  amountToDeliver?: Int | string | number | bigint
  /** Percentage to subtract from an external exchange rate to determine the minimum acceptable exchange rate */
  slippage?: number
  /** Set of asset codes -> price in a standardized base asset, to compute minimum exchange rates */
  prices?: {
    [assetCode: string]: number
  }
}

/** Parameters of payment execution and the projected outcome of a payment */
export interface Quote {
  /** How payment completion is ascertained: fixed send amount or fixed delivery amount */
  readonly paymentType: PaymentType
  /** Maximum amount that will be sent in source units */
  readonly maxSourceAmount: bigint
  /** Minimum amount that will be delivered if the payment fully completes */
  readonly minDeliveryAmount: bigint
  /** Discovered maximum packet amount allowed over this payment path */
  readonly maxPacketAmount: bigint
  /** Lower bound of probed exchange rate over the path (inclusive). Ratio of destination base units to source base units */
  readonly lowEstimatedExchangeRate: Ratio
  /** Upper bound of probed exchange rate over the path (exclusive). Ratio of destination base units to source base units */
  readonly highEstimatedExchangeRate: PositiveRatio
  /** Minimum exchange rate used to enforce rates. Ratio of destination base units to source base units */
  readonly minExchangeRate: Ratio
}

/** Quote with stricter types, for internal library use */
export type IntQuote = Omit<
  Quote,
  'maxSourceAmount' | 'minDeliveryAmount' | 'maxPacketAmount'
> & {
  readonly maxSourceAmount: PositiveInt
  readonly minDeliveryAmount: Int
  readonly maxPacketAmount: PositiveInt
}

/** Options before immediately executing payment */
export interface PayOptions {
  kycData?: string
  /** Plugin to send ILP packets over the network */
  plugin: Plugin
  /** Destination details of the payment to establish connection with recipient */
  destination: ResolvedPayment
  /** Parameters of payment execution */
  quote: Quote
  /**
   * Callback to process streaming updates as packets are sent and received,
   * such as to perform accounting while the payment is in progress.
   *
   * Handler will be called for all fulfillable packets and replies before the payment resolves.
   */
  progressHandler?: (progress: PaymentProgress) => void
}

/** Intermediate state or outcome of the payment, to account for sent/delivered amounts */
export interface PaymentProgress {
  /** Error state, if payment failed */
  error?: PaymentError
  /** Amount sent and fulfilled, in base units of the source asset. ≥0 */
  amountSent: bigint
  /** Amount delivered to recipient, in base units of the destination asset. ≥0 */
  amountDelivered: bigint
  /** Amount sent that is yet to be fulfilled or rejected, in base units of the source asset. ≥0 */
  sourceAmountInFlight: bigint
  /** Estimate of the amount that may be delivered from in-flight packets, in base units of the destination asset. ≥0 */
  destinationAmountInFlight: bigint
  /** Latest [STREAM receipt](https://interledger.org/rfcs/0039-stream-receipts/) to provide proof-of-delivery to a 3rd party verifier */
  streamReceipt?: Uint8Array
}

/** Payment error states */
export enum PaymentError {
  /**
   * Errors likely caused by the library user
   */

  /** Payment pointer or SPSP URL is syntactically invalid */
  InvalidPaymentPointer = 'InvalidPaymentPointer',
  /** STREAM credentials (shared secret and destination address) were not provided or invalid */
  InvalidCredentials = 'InvalidCredentials',
  /** Slippage percentage is not between 0 and 1 (inclusive) */
  InvalidSlippage = 'InvalidSlippage',
  /** Source asset or denomination was not provided */
  UnknownSourceAsset = 'UnknownSourceAsset',
  /** No fixed source amount or fixed destination amount was provided */
  UnknownPaymentTarget = 'UnknownPaymentTarget',
  /** Fixed source amount is invalid or too precise for the source account */
  InvalidSourceAmount = 'InvalidSourceAmount',
  /** Fixed delivery amount is invalid or too precise for the destination account */
  InvalidDestinationAmount = 'InvalidDestinationAmount',
  /** Minimum exchange rate is 0 after subtracting slippage and cannot enforce a fixed-delivery payment */
  UnenforceableDelivery = 'UnenforceableDelivery',
  /** Invalid quote parameters provided */
  InvalidQuote = 'InvalidQuote',
  /** Invalid destination like an Open Payments account URL provided */
  InvalidDestination = 'InvalidDestination',

  /**
   * Errors likely caused by the receiver, connectors, or other externalities
   */

  /** Failed to query an account or Incoming Payment from an Open Payments or SPSP server */
  QueryFailed = 'QueryFailed',
  /** Incoming payment was already completed */
  IncomingPaymentCompleted = 'IncomingPaymentCompleted',
  /** Incoming payment already expired */
  IncomingPaymentExpired = 'IncomingPaymentExpired',
  /** Cannot send over this path due to an ILP Reject error */
  ConnectorError = 'ConnectorError',
  /** No authentic reply from receiver: packets may not have been delivered */
  EstablishmentFailed = 'EstablishmentFailed',
  /** Destination asset details are unknown or the receiver never provided them */
  UnknownDestinationAsset = 'UnknownDestinationAsset',
  /** Receiver sent conflicting destination asset details */
  DestinationAssetConflict = 'DestinationAssetConflict',
  /** Failed to compute minimum rate: prices for source or destination assets were invalid or not provided */
  ExternalRateUnavailable = 'ExternalRateUnavailable',
  /** Rate probe failed to establish the exchange rate or discover path max packet amount */
  RateProbeFailed = 'RateProbeFailed',
  /** Real exchange rate is less than minimum exchange rate with slippage */
  InsufficientExchangeRate = 'InsufficientExchangeRate',
  /** No packets were fulfilled within timeout */
  IdleTimeout = 'IdleTimeout',
  /** Receiver closed the connection or stream, terminating the payment */
  ClosedByReceiver = 'ClosedByReceiver',
  /** Estimated destination amount exceeds the receiver's limit */
  IncompatibleReceiveMax = 'IncompatibleReceiveMax',
  /** Receiver violated the STREAM protocol, misrepresenting delivered amounts */
  ReceiverProtocolViolation = 'ReceiverProtocolViolation',
  /** Encrypted maximum number of packets using the key for this connection */
  MaxSafeEncryptionLimit = 'MaxSafeEncryptionLimit'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPaymentError = (o: any): o is PaymentError =>
  Object.values(PaymentError).includes(o)

/** Resolve destination details and asset of the payment in order to establish a STREAM connection */
export const setupPayment = async (
  options: SetupOptions
): Promise<ResolvedPayment> => {
  // Determine STREAM credentials, amount to pay, and destination details
  // by performing Open Payments/SPSP queries, or using the provided info
  const destinationDetailsOrError = await fetchPaymentDetails(options)
  if (isPaymentError(destinationDetailsOrError)) {
    throw destinationDetailsOrError
  }
  const destinationDetails = destinationDetailsOrError

  // Use STREAM to fetch the destination asset (returns immediately if asset is already known)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const requestCounter = Counter.from(0)!
  const assetOrError = await new AssetProbe(
    options.plugin,
    destinationDetails,
    requestCounter
  ).start()
  if (isPaymentError(assetOrError)) {
    throw assetOrError
  }
  const destinationAsset = assetOrError

  return {
    ...destinationDetails,
    destinationAsset,
    requestCounter
  }
}

/** Perform a rate probe: discover path max packet amount, probe the real exchange rate, and compute the minimum exchange rate and bounds of the payment. */
export const startQuote = async (options: QuoteOptions): Promise<Quote> => {
  const rateProbe = new RateProbe(options)
  const { log } = rateProbe
  const { destinationPaymentDetails, destinationAsset } = options.destination

  if (destinationPaymentDetails) {
    if (destinationPaymentDetails.completed) {
      log.debug('quote failed: Incoming Payment is already completed.')
      // In Incoming Payment case, STREAM connection is yet to be established since no asset probe
      throw PaymentError.IncomingPaymentCompleted
    }
    if (
      destinationPaymentDetails.expiresAt &&
      destinationPaymentDetails.expiresAt <= Date.now()
    ) {
      log.debug('quote failed: Incoming Payment is expired.')
      // In Incoming Payment case, STREAM connection is yet to be established since no asset probe
      throw PaymentError.IncomingPaymentExpired
    }
  }

  // Validate the amounts to set the target for the payment
  let target: {
    type: PaymentType
    amount: PositiveInt
  }

  if (
    destinationPaymentDetails &&
    typeof destinationPaymentDetails.incomingAmount !== 'undefined'
  ) {
    const remainingToDeliver = Int.from(
      destinationPaymentDetails.incomingAmount.value -
        destinationPaymentDetails.receivedAmount.value
    )
    if (!remainingToDeliver || !remainingToDeliver.isPositive()) {
      // Return this error here instead of in `setupPayment` so consumer can access the resolved Incoming Payment
      log.debug(
        'quote failed: Incoming Payment was already paid. incomingAmount=%s receivedAmount=%s',
        destinationPaymentDetails.incomingAmount,
        destinationPaymentDetails.receivedAmount
      )
      // In Incoming Payment case, STREAM connection is yet to be established since no asset probe
      throw PaymentError.IncomingPaymentCompleted
    }

    target = {
      type: PaymentType.FixedDelivery,
      amount: remainingToDeliver
    }
  } else if (typeof options.amountToDeliver !== 'undefined') {
    const amountToDeliver = Int.from(options.amountToDeliver)
    if (!amountToDeliver || !amountToDeliver.isPositive()) {
      log.debug('invalid config: amount to deliver is not a positive integer')
      throw PaymentError.InvalidDestinationAmount
    }

    target = {
      type: PaymentType.FixedDelivery,
      amount: amountToDeliver
    }
  }
  // Validate the target amount is non-zero and compatible with the precision of the accounts
  else if (typeof options.amountToSend !== 'undefined') {
    const amountToSend = Int.from(options.amountToSend)
    if (!amountToSend || !amountToSend.isPositive()) {
      log.debug('invalid config: amount to send is not a positive integer')
      throw PaymentError.InvalidSourceAmount
    }

    target = {
      type: PaymentType.FixedSend,
      amount: amountToSend
    }
  } else {
    log.debug(
      'invalid config: no Incoming Payment with existing incomingAmount, amount to send, or amount to deliver was provided'
    )
    throw PaymentError.UnknownPaymentTarget
  }

  // Validate the slippage
  const slippage = options.slippage ?? 0.01
  if (!isNonNegativeRational(slippage) || slippage > 1) {
    log.debug('invalid config: slippage is not a number between 0 and 1')
    throw PaymentError.InvalidSlippage
  }

  // No source asset or minimum rate computation if 100% slippage
  let externalRate: number
  if (slippage === 1) {
    externalRate = 0
  } else {
    // Validate source asset details
    const { sourceAsset } = options
    if (!isValidAssetDetails(sourceAsset)) {
      log.debug('invalid config: no source asset details were provided')
      throw PaymentError.UnknownSourceAsset
    }

    // Compute minimum exchange rate, or 1:1 if assets are the same.
    if (sourceAsset.code === destinationAsset.code) {
      externalRate = 1
    } else {
      const sourcePrice = options.prices?.[sourceAsset.code]
      const destinationPrice = options.prices?.[destinationAsset.code]

      // Ensure the prices are defined, finite, and denominator > 0
      if (
        !isNonNegativeRational(sourcePrice) ||
        !isNonNegativeRational(destinationPrice) ||
        destinationPrice === 0
      ) {
        log.debug(
          'quote failed: no external rate available from %s to %s',
          sourceAsset.code,
          destinationAsset.code
        )
        throw PaymentError.ExternalRateUnavailable
      }

      // This seems counterintuitive because rates are destination amount / source amount,
      // but each price *is a rate*, not an amount.
      // For example: sourcePrice => USD/ABC, destPrice => USD/XYZ, externalRate => XYZ/ABC
      externalRate = sourcePrice / destinationPrice
    }

    // Scale rate and apply slippage
    // prettier-ignore
    externalRate =
      externalRate *
      (1 - slippage) *
      10 ** (destinationAsset.scale - sourceAsset.scale)
  }

  const minExchangeRate = Ratio.from(externalRate as NonNegativeRational)
  log.debug('calculated min exchange rate of %s', minExchangeRate)

  // Perform rate probe: probe realized rate and discover path max packet amount
  log.debug('starting quote.')
  const rateProbeResult = await rateProbe.start()
  if (isPaymentError(rateProbeResult)) {
    throw rateProbeResult
  }
  log.debug('quote complete.')

  // Set the amounts to pay/deliver and perform checks to determine
  // if this is possible given the probed & minimum rates
  const {
    lowEstimatedExchangeRate,
    highEstimatedExchangeRate,
    maxPacketAmount
  } = rateProbeResult

  // From rate probe, source amount of lowerBoundRate should be the maxPacketAmount.
  // So, no rounding error is possible as long as minRate is at least the probed rate.
  // ceil(maxPacketAmount * minExchangeRate) >= floor(maxPacketAmount * lowerBoundRate)
  // ceil(maxPacketAmount * minExchangeRate) >= lowerBoundRate.delivered
  if (!lowEstimatedExchangeRate.isGreaterThanOrEqualTo(minExchangeRate)) {
    log.debug(
      'quote failed: probed exchange rate of %s does not exceed minimum of %s',
      lowEstimatedExchangeRate,
      minExchangeRate
    )
    throw PaymentError.InsufficientExchangeRate
  }

  // At each hop, up to 1 unit of the local asset before the conversion
  // is "lost" to rounding when the outgoing amount is floored.
  // If a small packet is sent, such as the final one in the payment,
  // it may not meet its minimum destination amount since the rounding
  // error caused a shortfall.

  // To address this, allow up to 1 source unit to *not* be delivered.
  // This is accounted for and allowed within the quoted maximum source amount.

  let maxSourceAmount: PositiveInt
  let minDeliveryAmount: Int

  if (target.type === PaymentType.FixedSend) {
    maxSourceAmount = target.amount
    minDeliveryAmount = target.amount
      .saturatingSubtract(Int.ONE)
      .multiplyCeil(minExchangeRate)
  } else if (!minExchangeRate.isPositive()) {
    log.debug(
      'quote failed: unenforceable payment delivery. min exchange rate is 0'
    )
    throw PaymentError.UnenforceableDelivery
  } else {
    // Consider that we're trying to discover the maximum original integer value that
    // delivered the target delivery amount. If it converts back into a decimal
    // source amount, it's safe to floor, since we assume each portion of the target
    // delivery amount was already ceil-ed and delivered at greater than the minimum rate.
    //
    // Then, add one to account for the source unit allowed lost to a rounding error.
    maxSourceAmount = target.amount
      .multiplyFloor(minExchangeRate.reciprocal())
      .add(Int.ONE)
    minDeliveryAmount = target.amount
  }

  return {
    paymentType: target.type,
    lowEstimatedExchangeRate,
    highEstimatedExchangeRate,
    minExchangeRate,
    maxPacketAmount: maxPacketAmount.value,
    maxSourceAmount: maxSourceAmount.value,
    minDeliveryAmount: minDeliveryAmount.value
  }
}

/** Send the payment: send a series of packets to attempt the payment within the completion criteria and limits of the provided quote. */
export const pay = async (options: PayOptions): Promise<PaymentProgress> => {
  const maxSourceAmount = Int.from(options.quote.maxSourceAmount)
  const minDeliveryAmount = Int.from(options.quote.minDeliveryAmount)
  const maxPacketAmount = Int.from(options.quote.maxPacketAmount)
  if (!maxSourceAmount || !maxSourceAmount.isPositive())
    throw PaymentError.InvalidQuote
  if (!minDeliveryAmount) throw PaymentError.InvalidQuote
  if (!maxPacketAmount || !maxPacketAmount.isPositive())
    throw PaymentError.InvalidQuote

  const sender = new PaymentSender({
    ...options,
    quote: {
      ...options.quote,
      maxSourceAmount,
      minDeliveryAmount,
      maxPacketAmount
    }
  })
  const error = await sender.start()

  return {
    ...(isPaymentError(error) && { error }),
    ...sender.getProgress()
  }
}

/** Notify receiver to close the connection */
export const closeConnection = async (
  plugin: Plugin,
  destination: ResolvedPayment
): Promise<void> => {
  await new ConnectionCloser(plugin, destination).start()
}
