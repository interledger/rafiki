import { StreamController } from '.'
import { StreamReply, StreamRequest } from '../request'
import { Int, PositiveInt, PositiveRatio, Ratio } from '../utils'

/** Track realized exchange rates and estimate source/destination amounts */
export class ExchangeRateController implements StreamController {
  constructor(
    /** Realized exchange rate is greater than or equal to this ratio (inclusive): destination / source */
    private lowerBoundRate: Ratio = Ratio.of(Int.ZERO, Int.ONE),

    /** Realized exchange rate is less than this ratio (exclusive): (destination + 1) / source */
    private upperBoundRate: PositiveRatio = Ratio.of(Int.MAX_U64, Int.ONE)
  ) {}

  applyRequest({ sourceAmount, log }: StreamRequest): (reply: StreamReply) => void {
    return ({ destinationAmount }: StreamReply) => {
      // Discard 0 amount packets
      if (!sourceAmount.isPositive()) {
        return
      }

      // Only track the rate for authentic STREAM replies
      if (!destinationAmount) {
        return
      }

      // Since intermediaries floor packet amounts, the exchange rate cannot be precisely computed:
      // it's only known with some margin however. However, as we send packets of varying sizes,
      // the upper and lower bounds should converge closer and closer to the real exchange rate.
      const packetUpperBoundRate = Ratio.of(destinationAmount.add(Int.ONE), sourceAmount)
      const packetLowerBoundRate = Ratio.of(destinationAmount, sourceAmount)

      // If the exchange rate fluctuated and is "out of bounds," reset it
      const shouldResetExchangeRate =
        packetUpperBoundRate.isLessThanOrEqualTo(this.lowerBoundRate) ||
        packetLowerBoundRate.isGreaterThanOrEqualTo(this.upperBoundRate)
      if (shouldResetExchangeRate) {
        log.debug(
          'exchange rate changed. resetting to [%s, %s]',
          packetLowerBoundRate,
          packetUpperBoundRate
        )
        this.upperBoundRate = packetUpperBoundRate
        this.lowerBoundRate = packetLowerBoundRate
        return
      }

      if (packetLowerBoundRate.isGreaterThan(this.lowerBoundRate)) {
        log.debug(
          'increasing probed rate lower bound from %s to %s',
          this.lowerBoundRate,
          packetLowerBoundRate
        )
        this.lowerBoundRate = packetLowerBoundRate
      }

      if (packetUpperBoundRate.isLessThan(this.upperBoundRate)) {
        log.debug(
          'reducing probed rate upper bound from %s to %s',
          this.upperBoundRate,
          packetUpperBoundRate
        )
        this.upperBoundRate = packetUpperBoundRate
      }
    }
  }

  getLowerBoundRate(): Ratio {
    return this.lowerBoundRate
  }

  getUpperBoundRate(): PositiveRatio {
    return this.upperBoundRate
  }

  /**
   * Estimate the delivered amount from the given source amount.
   * (1) Low-end estimate: at least this amount will get delivered, if the rate hasn't fluctuated.
   * (2) High-end estimate: no more than this amount will get delivered, if the rate hasn't fluctuated.
   *
   * Cap the destination amounts at the max U64, since that's the most that an ILP packet can credit.
   */
  estimateDestinationAmount(sourceAmount: Int): [Int, Int] {
    const lowEndDestination = sourceAmount.multiplyFloor(this.lowerBoundRate).orLesser(Int.MAX_U64)

    // Since upper bound exchange rate is exclusive:
    // If source amount converts exactly to an integer, destination amount MUST be 1 unit less
    // If source amount doesn't convert precisely, we can't narrow it any better than that amount, floored ¯\_(ツ)_/¯
    const highEndDestination = sourceAmount
      .multiplyCeil(this.upperBoundRate)
      .saturatingSubtract(Int.ONE)
      .orLesser(Int.MAX_U64)

    return [lowEndDestination, highEndDestination]
  }

  /**
   * Estimate the source amount that delivers the given destination amount.
   * (1) Low-end estimate (may under-deliver, won't over-deliver): lowest source amount
   *     that *may* deliver the given destination amount, if the rate hasn't fluctuated.
   * (2) High-end estimate (won't under-deliver, may over-deliver): lowest source amount that
   *     delivers at least the given destination amount, if the rate hasn't fluctuated.
   *
   * Returns `undefined` if the rate is 0 and it may not be possible to deliver anything.
   */
  estimateSourceAmount(destinationAmount: PositiveInt): [PositiveInt, PositiveInt] | undefined {
    // If the exchange rate is a packet that delivered 0, the source amount is undefined
    const lowerBoundRate = this.lowerBoundRate.reciprocal()
    if (!lowerBoundRate) {
      return
    }

    const lowEndSource = destinationAmount
      .multiplyFloor(this.upperBoundRate.reciprocal())
      .add(Int.ONE)
    const highEndSource = destinationAmount.multiplyCeil(lowerBoundRate)
    return [lowEndSource, highEndSource]
  }
}
