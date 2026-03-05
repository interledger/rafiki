import { PaymentError, QuoteOptions } from '..'
import { SendState, StreamController } from '../controllers'
import { Int, PositiveInt, PositiveRatio, Ratio } from '../utils'
import { MaxPacketAmountController } from '../controllers/max-packet'
import { ExchangeRateController } from '../controllers/exchange-rate'
import { SequenceController } from '../controllers/sequence'
import { EstablishmentController } from '../controllers/establishment'
import { ExpiryController } from '../controllers/expiry'
import { FailureController } from '../controllers/failure'
import { AssetDetailsController } from '../controllers/asset-details'
import { PacingController } from '../controllers/pacer'
import { RequestBuilder } from '../request'
import { StreamSender } from '.'

export interface ProbeResult {
  maxPacketAmount: PositiveInt
  lowEstimatedExchangeRate: Ratio
  highEstimatedExchangeRate: PositiveRatio
}

/** Establish exchange rate bounds and path max packet amount capacity with test packets */
export class RateProbe extends StreamSender<ProbeResult> {
  /** Duration in milliseconds before the rate probe fails */
  private static TIMEOUT = 10_000

  /** Largest test packet amount */
  static MAX_PROBE_AMOUNT = Int.from(1_000_000_000_000) as PositiveInt

  /**
   * Initial barage of test packets amounts left to send (10^12 ... 10^3).
   * Amounts < 1000 units are less likely to offer sufficient precision for quoting
   */
  private readonly remainingTestAmounts = [
    Int.ZERO, // Shares limits & ensures connection is established, in case no asset probe
    Int.from(10 ** 12),
    Int.from(10 ** 11),
    Int.from(10 ** 10),
    Int.from(10 ** 9),
    Int.from(10 ** 8),
    Int.from(10 ** 7),
    Int.from(10 ** 6),
    Int.from(10 ** 5),
    Int.from(10 ** 4),
    Int.from(10 ** 3)
  ] as Int[]

  /**
   * Amounts of all in-flight packets from subsequent (non-initial) probe packets,
   * to ensure the same amount isn't sent continuously
   */
  private readonly inFlightAmounts = new Set<bigint>()

  /** UNIX timestamp when the rate probe fails */
  private deadline?: number

  protected readonly controllers: StreamController[]

  private maxPacketController: MaxPacketAmountController
  private rateCalculator: ExchangeRateController

  constructor({ plugin, destination }: QuoteOptions) {
    super(plugin, destination)
    const { requestCounter } = destination

    this.rateCalculator = new ExchangeRateController()
    this.maxPacketController = new MaxPacketAmountController()

    // prettier-ignore
    this.controllers = [
      new SequenceController(requestCounter),   // Log sequence number in subsequent controllers
      new EstablishmentController(destination), // Set destination address for all requests
      new ExpiryController(),                   // Set expiry for all requests
      new FailureController(),                  // Fail fast on terminal rejects or connection closes
      this.maxPacketController,                 // Fail fast if max packet amount is 0
      new AssetDetailsController(destination),  // Fail fast on destination asset conflicts
      new PacingController(),                   // Limit frequency of requests
      this.rateCalculator,
    ]
  }

  nextState(request: RequestBuilder): SendState<ProbeResult> {
    if (!this.deadline) {
      this.deadline = Date.now() + RateProbe.TIMEOUT
    } else if (Date.now() > this.deadline) {
      request.log.error(
        'rate probe failed. did not establish rate and/or path capacity'
      )
      return SendState.Error(PaymentError.RateProbeFailed)
    }

    const probeAmount = this.remainingTestAmounts.shift()
    if (!probeAmount || this.inFlightAmounts.has(probeAmount.value)) {
      return SendState.Yield()
    }

    // Send and commit the test packet
    request.setSourceAmount(probeAmount)
    this.inFlightAmounts.add(probeAmount.value)
    return SendState.Send(() => {
      this.inFlightAmounts.delete(probeAmount.value)

      // If we further narrowed the max packet amount, use that amount next.
      // Otherwise, no max packet limit is known, so retry this amount.
      const nextProbeAmount =
        this.maxPacketController.getNextMaxPacketAmount() ?? probeAmount
      if (
        !this.remainingTestAmounts.some((n) => n.isEqualTo(nextProbeAmount))
      ) {
        this.remainingTestAmounts.push(nextProbeAmount)
      }

      // Resolve rate probe if verified path capacity (ensures a rate is also known)
      return this.maxPacketController.isProbeComplete()
        ? SendState.Done({
            lowEstimatedExchangeRate: this.rateCalculator.getLowerBoundRate(),
            highEstimatedExchangeRate: this.rateCalculator.getUpperBoundRate(),
            maxPacketAmount: this.maxPacketController.getMaxPacketAmountLimit()
          })
        : SendState.Schedule() // Try sending another probing packet to narrow max packet amount
    })
  }
}
