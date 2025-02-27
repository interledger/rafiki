import { RequestState, StreamController } from '.'
import { sleep } from '../utils'
import { StreamReply } from '../request'

/**
 * Flow controller to send packets at a consistent cadence
 * and prevent sending more packets than the network can handle
 */
export class PacingController implements StreamController {
  /** Initial number of packets to send in 1 second interval (25ms delay between packets) */
  private static DEFAULT_PACKETS_PER_SECOND = 40

  /** Always try to send at least 1 packet in 1 second (unless RTT is very high) */
  private static MIN_PACKETS_PER_SECOND = 1

  /** Maximum number of packets to send in a 1 second interval, after ramp up (5ms delay) */
  private static MAX_PACKETS_PER_SECOND = 200

  /** Additive increase of packets per second rate on authentic reply */
  private static PACKETS_PER_SECOND_INCREASE_TERM = 0.5

  /** Multiplicative decrease of packets per second rate on transient error */
  private static PACKETS_PER_SECOND_DECREASE_FACTOR = 0.5

  /** RTT to use for pacing before an average can be ascertained */
  private static DEFAULT_ROUND_TRIP_TIME_MS = 200

  /** Weight to compute next RTT average. Halves weight of past round trips every ~5 flights */
  private static ROUND_TRIP_AVERAGE_WEIGHT = 0.9

  /** Maximum number of packets to have in-flight, yet to receive a Fulfill or Reject */
  private static MAX_INFLIGHT_PACKETS = 20

  /** UNIX timestamp when most recent packet was sent */
  private lastPacketSentTime = 0

  /** Exponential weighted moving average of the round trip time */
  private averageRoundTrip = PacingController.DEFAULT_ROUND_TRIP_TIME_MS

  /** Rate of packets to send per second. This shouldn't ever be 0, but may become a small fraction */
  private packetsPerSecond = PacingController.DEFAULT_PACKETS_PER_SECOND

  /** Number of in-flight requests */
  private inFlightCount = 0

  /**
   * Rate to send packets, in packets / millisecond, using packet rate limit and round trip time.
   * Corresponds to the ms delay between each packet
   */
  getPacketFrequency(): number {
    const packetsPerSecondDelay = 1000 / this.packetsPerSecond
    const maxInFlightDelay = this.averageRoundTrip / PacingController.MAX_INFLIGHT_PACKETS

    return Math.max(packetsPerSecondDelay, maxInFlightDelay)
  }

  /** Earliest UNIX timestamp when the pacer will allow the next packet to be sent */
  getNextPacketSendTime(): number {
    const delayDuration = this.getPacketFrequency()
    return this.lastPacketSentTime + delayDuration
  }

  buildRequest(): RequestState {
    const durationUntilNextPacket = this.getNextPacketSendTime() - Date.now()
    return durationUntilNextPacket > 0
      ? RequestState.Schedule(sleep(durationUntilNextPacket))
      : this.inFlightCount >= PacingController.MAX_INFLIGHT_PACKETS
      ? RequestState.Yield() // Assumes sender will schedule another attempt when in-flight requests complete
      : RequestState.Ready()
  }

  applyRequest(): (reply: StreamReply) => void {
    const sentTime = Date.now()
    this.lastPacketSentTime = sentTime

    this.inFlightCount++

    return (reply: StreamReply) => {
      this.inFlightCount--

      // Only update the RTT if we know the request got to the recipient
      if (reply.isAuthentic()) {
        const roundTripTime = Math.max(Date.now() - sentTime, 0)
        this.averageRoundTrip =
          this.averageRoundTrip * PacingController.ROUND_TRIP_AVERAGE_WEIGHT +
          roundTripTime * (1 - PacingController.ROUND_TRIP_AVERAGE_WEIGHT)
      }

      // TODO Add separate liquidity congestion controller/logic, don't backoff in time on T04s

      // If we encounter a temporary error that's not related to liquidity,
      // exponentially backoff the rate of packet sending
      if (reply.isReject() && reply.ilpReject.code[0] === 'T') {
        const reducedRate = Math.max(
          PacingController.MIN_PACKETS_PER_SECOND,
          this.packetsPerSecond * PacingController.PACKETS_PER_SECOND_DECREASE_FACTOR // Fractional rates are fine
        )
        reply.log.debug(
          'handling %s. backing off to %s packets / second',
          reply.ilpReject.code,
          reducedRate.toFixed(3)
        )
        this.packetsPerSecond = reducedRate
      }
      // If the packet got through, additive increase of sending rate, up to some maximum
      else if (reply.isAuthentic()) {
        this.packetsPerSecond = Math.min(
          PacingController.MAX_PACKETS_PER_SECOND,
          this.packetsPerSecond + PacingController.PACKETS_PER_SECOND_INCREASE_TERM
        )
      }
    }
  }
}
