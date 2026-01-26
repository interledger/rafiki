import { RequestState, SendState, StreamController } from '../controllers'
import { Int } from '../utils'
import {
  StreamMaxMoneyFrame,
  FrameType,
  StreamMoneyFrame,
  StreamReceiptFrame
} from 'ilp-protocol-stream/dist/src/packet'
import { MaxPacketAmountController } from '../controllers/max-packet'
import { ExchangeRateController } from '../controllers/exchange-rate'
import { IntQuote, PaymentError, PaymentProgress, PayOptions } from '..'
import { RequestBuilder, StreamReply } from '../request'
import { PacingController } from '../controllers/pacer'
import { AssetDetailsController } from '../controllers/asset-details'
import { TimeoutController } from '../controllers/timeout'
import { FailureController } from '../controllers/failure'
import { ExpiryController } from '../controllers/expiry'
import { EstablishmentController } from '../controllers/establishment'
import { SequenceController } from '../controllers/sequence'
import { decodeReceipt, Receipt as StreamReceipt } from 'ilp-protocol-stream'
import { StreamSender } from '.'
import { AppDataController } from '../controllers/app-data'

/** Completion criteria of the payment */
export enum PaymentType {
  /** Send up to a maximum source amount */
  FixedSend = 'FixedSend',
  /** Send to meet a minimum delivery amount, bounding the source amount and rates */
  FixedDelivery = 'FixedDelivery'
}

type PaymentSenderOptions = Omit<PayOptions, 'quote'> & { quote: IntQuote }

/** Controller to track the payment status and compute amounts to send and deliver */
export class PaymentSender extends StreamSender<PaymentProgress> {
  static DEFAULT_STREAM_ID = 1

  /** Total amount sent and fulfilled, in scaled units of the sending account */
  private amountSent = Int.ZERO

  /** Total amount delivered and fulfilled, in scaled units of the receiving account */
  private amountDelivered = Int.ZERO

  /** Amount sent that is yet to be fulfilled or rejected, in scaled units of the sending account */
  private sourceAmountInFlight = Int.ZERO

  /** Estimate of the amount that may be delivered from in-flight packets, in scaled units of the receiving account */
  private destinationAmountInFlight = Int.ZERO

  /** Was the rounding error shortfall applied to an in-flight or delivered packet? */
  private appliedRoundingCorrection = false

  /** Maximum amount the recipient can receive on the default stream */
  private remoteReceiveMax?: Int

  /** Greatest STREAM receipt and amount, to prove delivery to a third-party verifier */
  private latestReceipt?: {
    totalReceived: Int
    buffer: Buffer
  }

  /** Payment execution and minimum rates */
  private readonly quote: IntQuote

  /** Callback to pass updates as packets are sent and received */
  private readonly progressHandler?: (status: PaymentProgress) => void

  protected readonly controllers: StreamController[]

  private readonly rateCalculator: ExchangeRateController
  private readonly maxPacketController: MaxPacketAmountController

  constructor({
    plugin,
    destination,
    quote,
    progressHandler,
    appData
  }: PaymentSenderOptions) {
    super(plugin, destination)
    const { requestCounter } = destination

    this.quote = quote
    this.progressHandler = progressHandler

    this.maxPacketController = new MaxPacketAmountController(
      this.quote.maxPacketAmount
    )
    this.rateCalculator = new ExchangeRateController(
      quote.lowEstimatedExchangeRate,
      quote.highEstimatedExchangeRate
    )

    const appDataController = appData
      ? new AppDataController(appData, PaymentSender.DEFAULT_STREAM_ID)
      : undefined

    this.controllers = [
      new SequenceController(requestCounter),
      new EstablishmentController(destination),
      new ExpiryController(),
      ...(appDataController ? [appDataController] : []),
      new FailureController(),
      new TimeoutController(),
      this.maxPacketController,
      new AssetDetailsController(destination),
      new PacingController(),
      this.rateCalculator
    ]

    this.log.debug('starting payment.')
  }

  nextState(request: RequestBuilder): SendState<PaymentProgress> {
    const { log } = request

    // Ensure we never overpay the maximum source amount
    const availableToSend = this.quote.maxSourceAmount
      .saturatingSubtract(this.amountSent)
      .saturatingSubtract(this.sourceAmountInFlight)
    if (!availableToSend.isPositive()) {
      // If we've sent as much as we can, next attempt will only be scheduled after an in-flight request finishes
      return SendState.Yield()
    }

    // Compute source amount (always positive)
    const maxPacketAmount = this.maxPacketController.getNextMaxPacketAmount()
    let sourceAmount = availableToSend
      .orLesser(maxPacketAmount)
      .orLesser(Int.MAX_U64)

    // Does this request complete the payment, so should the rounding correction be applied?
    let completesPayment = false

    // Apply fixed delivery limits
    if (this.quote.paymentType === PaymentType.FixedDelivery) {
      const remainingToDeliver = this.quote.minDeliveryAmount
        .saturatingSubtract(this.amountDelivered)
        .saturatingSubtract(this.destinationAmountInFlight)
      if (!remainingToDeliver.isPositive()) {
        // If we've already sent enough to potentially complete the payment,
        // next attempt will only be scheduled after an in-flight request finishes
        return SendState.Yield()
      }

      const sourceAmountDeliveryLimit =
        this.rateCalculator.estimateSourceAmount(remainingToDeliver)?.[1]
      if (!sourceAmountDeliveryLimit) {
        log.warn('payment cannot complete: exchange rate dropped to 0')
        return SendState.Error(PaymentError.InsufficientExchangeRate)
      }

      sourceAmount = sourceAmount.orLesser(sourceAmountDeliveryLimit)
      completesPayment = sourceAmount.isEqualTo(sourceAmountDeliveryLimit)
    } else {
      completesPayment = sourceAmount.isEqualTo(availableToSend)
    }

    // Enforce the minimum exchange rate.
    // Allow up to 1 source unit to be lost to rounding only *on the final packet*.
    const applyCorrection = completesPayment && !this.appliedRoundingCorrection
    const minDestinationAmount = applyCorrection
      ? sourceAmount
          .saturatingSubtract(Int.ONE)
          .multiplyCeil(this.quote.minExchangeRate)
      : sourceAmount.multiplyCeil(this.quote.minExchangeRate)

    // If the min destination amount isn't met, the rate dropped and payment cannot be completed.
    const [projectedDestinationAmount, highEndDestinationAmount] =
      this.rateCalculator.estimateDestinationAmount(sourceAmount)
    if (projectedDestinationAmount.isLessThan(minDestinationAmount)) {
      log.warn('payment cannot complete: exchange rate dropped below minimum')
      return RequestState.Error(PaymentError.InsufficientExchangeRate)
    }

    // Rate calculator caps projected destination amounts to U64,
    // so that checks against `minDestinationAmount` overflowing U64 range

    // Update in-flight amounts (request will be applied synchronously)
    this.sourceAmountInFlight = this.sourceAmountInFlight.add(sourceAmount)
    this.destinationAmountInFlight = this.destinationAmountInFlight.add(
      highEndDestinationAmount
    )
    this.appliedRoundingCorrection = applyCorrection

    this.progressHandler?.(this.getProgress())

    request
      .setSourceAmount(sourceAmount)
      .setMinDestinationAmount(minDestinationAmount)
      .enableFulfillment()
      .addFrames(new StreamMoneyFrame(PaymentSender.DEFAULT_STREAM_ID, 1))

    return SendState.Send((reply) => {
      // Delivered amount must be *at least* the minimum acceptable amount we told the receiver
      // No matter what, since they fulfilled it, we must assume they got at least the minimum
      const destinationAmount = minDestinationAmount.orGreater(
        reply.destinationAmount
      )

      if (reply.isFulfill()) {
        this.amountSent = this.amountSent.add(sourceAmount)
        this.amountDelivered = this.amountDelivered.add(destinationAmount)

        log.debug(
          'accounted for fulfill. sent=%s delivered=%s minDestination=%s',
          sourceAmount,
          destinationAmount,
          minDestinationAmount
        )
      }

      if (
        reply.isReject() &&
        reply.destinationAmount?.isLessThan(minDestinationAmount)
      ) {
        log.debug(
          'packet rejected for insufficient rate. received=%s minDestination=%s',
          reply.destinationAmount,
          minDestinationAmount
        )
      }

      // Update in-flight amounts
      this.sourceAmountInFlight =
        this.sourceAmountInFlight.saturatingSubtract(sourceAmount)
      this.destinationAmountInFlight =
        this.destinationAmountInFlight.saturatingSubtract(
          highEndDestinationAmount
        )
      // If this packet failed (e.g. for some other reason), refund the delivery deficit so it may be retried
      if (reply.isReject() && applyCorrection) {
        this.appliedRoundingCorrection = false
      }

      log.debug(
        'payment sent %s of %s (max). inflight=%s',
        this.amountSent,
        this.quote.maxSourceAmount,
        this.sourceAmountInFlight
      )
      log.debug(
        'payment delivered %s of %s (min). inflight=%s (destination units)',
        this.amountDelivered,
        this.quote.minDeliveryAmount,
        this.destinationAmountInFlight
      )

      this.updateStreamReceipt(reply)

      this.progressHandler?.(this.getProgress())

      // Handle protocol violations after all accounting has been performed
      if (reply.isFulfill()) {
        if (!reply.destinationAmount) {
          // Technically, an intermediary could strip the data so we can't ascertain whose fault this is
          log.warn(
            'ending payment: packet fulfilled with no authentic STREAM data'
          )
          return SendState.Error(PaymentError.ReceiverProtocolViolation)
        } else if (reply.destinationAmount.isLessThan(minDestinationAmount)) {
          log.warn(
            'ending payment: receiver violated procotol. packet fulfilled below min exchange rate. delivered=%s minDestination=%s',
            destinationAmount,
            minDestinationAmount
          )
          return SendState.Error(PaymentError.ReceiverProtocolViolation)
        }
      }

      const paidFixedSend =
        this.quote.paymentType === PaymentType.FixedSend &&
        this.amountSent.isEqualTo(this.quote.maxSourceAmount) // Amount in flight is always 0 if this is true
      if (paidFixedSend) {
        log.debug('payment complete: paid fixed source amount.')
        return SendState.Done(this.getProgress())
      }

      const paidFixedDelivery =
        this.quote.paymentType === PaymentType.FixedDelivery &&
        this.amountDelivered.isGreaterThanOrEqualTo(
          this.quote.minDeliveryAmount
        ) &&
        !this.sourceAmountInFlight.isPositive()
      if (paidFixedDelivery) {
        log.debug('payment complete: paid fixed destination amount.')
        return SendState.Done(this.getProgress())
      }

      this.remoteReceiveMax =
        this.updateReceiveMax(reply)?.orGreater(this.remoteReceiveMax) ??
        this.remoteReceiveMax
      if (this.remoteReceiveMax?.isLessThan(this.quote.minDeliveryAmount)) {
        log.error(
          'ending payment: minimum delivery amount is too much for recipient. minDelivery=%s receiveMax=%s',
          this.quote.minDeliveryAmount,
          this.remoteReceiveMax
        )
        return SendState.Error(PaymentError.IncompatibleReceiveMax)
      }

      // Since payment isn't complete yet, immediately queue attempt to send more money
      // (in case we were at max in flight previously)
      return SendState.Schedule()
    })
  }

  getProgress(): PaymentProgress {
    return {
      streamReceipt: this.latestReceipt?.buffer,
      amountSent: this.amountSent.value,
      amountDelivered: this.amountDelivered.value,
      sourceAmountInFlight: this.sourceAmountInFlight.value,
      destinationAmountInFlight: this.destinationAmountInFlight.value
    }
  }

  private updateReceiveMax({ frames }: StreamReply): Int | undefined {
    return frames
      ?.filter(
        (frame): frame is StreamMaxMoneyFrame =>
          frame.type === FrameType.StreamMaxMoney
      )
      .filter((frame) => frame.streamId.equals(PaymentSender.DEFAULT_STREAM_ID))
      .map((frame) => Int.from(frame.receiveMax))?.[0]
  }

  private updateStreamReceipt({ log, frames }: StreamReply): void {
    // Check for receipt frame
    // No need to check streamId, since we only send over stream=1
    const receiptBuffer = frames?.find(
      (frame): frame is StreamReceiptFrame =>
        frame.type === FrameType.StreamReceipt
    )?.receipt
    if (!receiptBuffer) {
      return
    }

    // Decode receipt, discard if invalid
    let receipt: StreamReceipt
    try {
      receipt = decodeReceipt(receiptBuffer)
    } catch (_) {
      return
    }

    const newTotalReceived = Int.from(receipt.totalReceived)
    if (
      !this.latestReceipt ||
      newTotalReceived.isGreaterThan(this.latestReceipt.totalReceived)
    ) {
      log.debug('updated latest stream receipt for %s', newTotalReceived)
      this.latestReceipt = {
        totalReceived: newTotalReceived,
        buffer: receiptBuffer
      }
    }
  }
}
