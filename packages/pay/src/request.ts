import { Logger } from 'ilp-logger'
import {
  deserializeIlpReply,
  IlpError,
  IlpErrorCode,
  IlpPacketType,
  IlpReject,
  IlpReply,
  isFulfill,
  isReject,
  serializeIlpPrepare,
  IlpAddress,
} from 'ilp-packet'
import { randomBytes } from 'crypto'
import { Frame, FrameType, Packet as StreamPacket } from 'ilp-protocol-stream/dist/src/packet'
import { generateEncryptionKey, generateFulfillmentKey, hmac, Int, sha256, timeout } from './utils'

export interface Plugin {
  sendData(data: Buffer): Promise<Buffer>
}

/** Generate keys and serialization function to send ILP Prepares over STREAM */
export const generateKeys = (
  plugin: Plugin,
  sharedSecret: Buffer
): ((request: StreamRequest) => Promise<StreamReply>) => {
  const encryptionKey = generateEncryptionKey(sharedSecret)
  const fulfillmentKey = generateFulfillmentKey(sharedSecret)

  return async (request: StreamRequest): Promise<StreamReply> => {
    // Create the STREAM request packet
    const {
      sequence,
      sourceAmount,
      destinationAddress,
      minDestinationAmount,
      frames,
      isFulfillable,
      expiresAt,
      log,
    } = request

    const streamRequest = new StreamPacket(
      sequence,
      IlpPacketType.Prepare.valueOf(),
      minDestinationAmount.toLong(),
      frames
    )

    const data = await streamRequest.serializeAndEncrypt(encryptionKey)

    let executionCondition: Buffer
    let fulfillment: Buffer | undefined

    if (isFulfillable) {
      fulfillment = hmac(fulfillmentKey, data)
      executionCondition = sha256(fulfillment)
      log.debug(
        'sending Prepare. amount=%s minDestinationAmount=%s frames=[%s]',
        sourceAmount,
        minDestinationAmount,
        frames.map((f) => FrameType[f.type]).join()
      )
    } else {
      executionCondition = randomBytes(32)
      log.debug(
        'sending unfulfillable Prepare. amount=%s frames=[%s]',
        sourceAmount,
        frames.map((f) => FrameType[f.type]).join()
      )
    }

    log.trace('loading Prepare with frames: %o', frames)

    // Create and serialize the ILP Prepare
    const preparePacket = serializeIlpPrepare({
      destination: destinationAddress,
      amount: sourceAmount.toString(), // Max packet amount controller always limits this to U64
      executionCondition,
      expiresAt,
      data,
    })

    // Send the packet!
    const pendingReply = plugin
      .sendData(preparePacket)
      .then((data) => {
        try {
          return deserializeIlpReply(data)
        } catch (_) {
          return createReject(IlpError.F01_INVALID_PACKET)
        }
      })
      .catch((err) => {
        log.error('failed to send Prepare:', err)
        return createReject(IlpError.T00_INTERNAL_ERROR)
      })
      .then((ilpReply) => {
        if (!isFulfill(ilpReply) || !fulfillment || ilpReply.fulfillment.equals(fulfillment)) {
          return ilpReply
        }

        log.error(
          'got invalid fulfillment: %h. expected: %h, condition: %h',
          ilpReply.fulfillment,
          fulfillment,
          executionCondition
        )
        return createReject(IlpError.F05_WRONG_CONDITION)
      })

    // Await reply and timeout if the packet expires
    const timeoutDuration = expiresAt.getTime() - Date.now()
    const ilpReply: IlpReply = await timeout(timeoutDuration, pendingReply).catch(() => {
      log.error('request timed out.')
      return createReject(IlpError.R00_TRANSFER_TIMED_OUT)
    })

    const streamReply = await StreamPacket.decryptAndDeserialize(
      encryptionKey,
      ilpReply.data
    ).catch(() => undefined)

    if (isFulfill(ilpReply)) {
      log.debug('got Fulfill. sentAmount=%s', sourceAmount)
    } else if (isReject(ilpReply)) {
      log.debug('got %s Reject: %s', ilpReply.code, ILP_ERROR_CODES[ilpReply.code as IlpErrorCode])

      if (ilpReply.message.length > 0 || ilpReply.triggeredBy.length > 0) {
        log.trace('Reject message="%s" triggeredBy=%s', ilpReply.message, ilpReply.triggeredBy)
      }
    } else {
      throw new Error('ILP response is neither fulfillment nor rejection')
    }

    let responseFrames: Frame[] | undefined
    let destinationAmount: Int | undefined

    // Validate the STREAM reply from recipient
    if (streamReply) {
      if (streamReply.sequence.notEquals(sequence)) {
        log.error('discarding STREAM reply: received invalid sequence %s', streamReply.sequence)
      } else if (+streamReply.ilpPacketType === IlpPacketType.Reject && isFulfill(ilpReply)) {
        // If receiver claimed they sent a Reject but we got a Fulfill, they lied!
        // If receiver said they sent a Fulfill but we got a Reject, that's possible
        log.error(
          'discarding STREAM reply: received Fulfill, but recipient claims they sent a Reject'
        )
      } else {
        responseFrames = streamReply.frames
        destinationAmount = Int.from(streamReply.prepareAmount)

        log.debug(
          'got authentic STREAM reply. receivedAmount=%s frames=[%s]',
          destinationAmount,
          responseFrames.map((f) => FrameType[f.type]).join()
        )
        log.trace('STREAM reply frames: %o', responseFrames)
      }
    } else if (
      (isFulfill(ilpReply) || ilpReply.code !== IlpError.F08_AMOUNT_TOO_LARGE) &&
      ilpReply.data.byteLength > 0
    ) {
      // If there's data in a Fulfill or non-F08 reject, it is expected to be a valid STREAM packet
      log.warn('data in reply unexpectedly failed decryption.')
    }

    return isFulfill(ilpReply)
      ? new StreamFulfill(log, responseFrames, destinationAmount)
      : new StreamReject(log, ilpReply, responseFrames, destinationAmount)
  }
}

/** Mapping of ILP error codes to its error message */
const ILP_ERROR_CODES = {
  // Final errors
  F00: 'bad request',
  F01: 'invalid packet',
  F02: 'unreachable',
  F03: 'invalid amount',
  F04: 'insufficient destination amount',
  F05: 'wrong condition',
  F06: 'unexpected payment',
  F07: 'cannot receive',
  F08: 'amount too large',
  F99: 'application error',
  // Temporary errors
  T00: 'internal error',
  T01: 'peer unreachable',
  T02: 'peer busy',
  T03: 'connector busy',
  T04: 'insufficient liquidity',
  T05: 'rate limited',
  T99: 'application error',
  // Relative errors
  R00: 'transfer timed out',
  R01: 'insufficient source amount',
  R02: 'insufficient timeout',
  R99: 'application error',
}

/** Construct a simple ILP Reject packet */
const createReject = (code: IlpError): IlpReject => ({
  code,
  message: '',
  triggeredBy: '',
  data: Buffer.alloc(0),
})

/** Amounts and data to send a unique ILP Prepare over STREAM */
export interface StreamRequest {
  /** ILP address of the recipient account */
  destinationAddress: IlpAddress
  /** Expiration timestamp when the ILP Prepare is void */
  expiresAt: Date
  /** Sequence number of the STREAM packet (u32) */
  sequence: number
  /** Amount to send in the ILP Prepare */
  sourceAmount: Int
  /** Minimum destination amount to tell the recipient ("prepare amount") */
  minDestinationAmount: Int
  /** Frames to load within the STREAM packet */
  frames: Frame[]
  /** Should the recipient be allowed to fulfill this request, or should it use a random condition? */
  isFulfillable: boolean
  /** Logger namespaced to this connection and request sequence number */
  log: Logger
}

/** Builder to construct the next ILP Prepare and STREAM request */
export class RequestBuilder implements StreamRequest {
  private request: StreamRequest

  constructor(request?: Partial<StreamRequest>) {
    this.request = {
      destinationAddress: 'private.example' as IlpAddress,
      expiresAt: new Date(),
      sequence: 0,
      sourceAmount: Int.ZERO,
      minDestinationAmount: Int.ZERO,
      frames: [],
      isFulfillable: false,
      log: new Logger('ilp-pay'),
      ...request,
    }
  }

  get destinationAddress(): IlpAddress {
    return this.request.destinationAddress
  }

  get expiresAt(): Date {
    return this.request.expiresAt
  }

  get sequence(): number {
    return this.request.sequence
  }

  get sourceAmount(): Int {
    return this.request.sourceAmount
  }

  get minDestinationAmount(): Int {
    return this.request.minDestinationAmount
  }

  get frames(): Frame[] {
    return this.request.frames
  }

  get isFulfillable(): boolean {
    return this.request.isFulfillable
  }

  get log(): Logger {
    return this.request.log
  }

  /** Set the ILP address of the destination of the ILP Prepare */
  setDestinationAddress(address: IlpAddress): this {
    this.request.destinationAddress = address
    return this
  }

  /** Set the expiration time of the ILP Prepare */
  setExpiry(expiresAt: Date): this {
    this.request.expiresAt = expiresAt
    return this
  }

  /** Set the sequence number of STREAM packet, to correlate the reply */
  setSequence(sequence: number): this {
    this.request.sequence = sequence
    this.request.log = this.request.log.extend(sequence.toString())
    return this
  }

  /** Set the source amount of the ILP Prepare */
  setSourceAmount(sourceAmount: Int): this {
    this.request.sourceAmount = sourceAmount
    return this
  }

  /** Set the minimum destination amount for the receiver to fulfill the ILP Prepare */
  setMinDestinationAmount(minDestinationAmount: Int): this {
    this.request.minDestinationAmount = minDestinationAmount
    return this
  }

  /** Add frames to include for the STREAM receiver */
  addFrames(...frames: Frame[]): this {
    this.request.frames = [...this.request.frames, ...frames]
    return this
  }

  /** Enable the STREAM receiver to fulfill this ILP Prepare. By default, a random, unfulfillable condition is used. */
  enableFulfillment(): this {
    this.request.isFulfillable = true
    return this
  }

  build(): StreamRequest {
    return { ...this.request }
  }
}

export interface StreamReply {
  /** Logger namespaced to this connection and request sequence number */
  readonly log: Logger
  /** Parsed frames from the STREAM response packet. Omitted if no authentic STREAM reply */
  readonly frames?: Frame[]
  /** Amount the recipient claimed to receive. Omitted if no authentic STREAM reply */
  readonly destinationAmount?: Int
  /**
   * Did the recipient authenticate that they received the STREAM request packet?
   * If they responded with a Fulfill or valid STREAM reply, they necessarily decoded the request
   */
  isAuthentic(): boolean
  /** Is this an ILP Reject packet? */
  isReject(): this is StreamReject
  /** Is this an ILP Fulfill packet? */
  isFulfill(): this is StreamFulfill
}

export class StreamFulfill implements StreamReply {
  readonly log: Logger
  readonly frames?: Frame[]
  readonly destinationAmount?: Int

  constructor(log: Logger, frames?: Frame[], destinationAmount?: Int) {
    this.log = log
    this.frames = frames
    this.destinationAmount = destinationAmount
  }

  isAuthentic(): boolean {
    return true
  }

  isReject(): this is StreamReject {
    return false
  }

  isFulfill(): this is StreamFulfill {
    return true
  }
}

export class StreamReject implements StreamReply {
  readonly log: Logger
  readonly frames?: Frame[]
  readonly destinationAmount?: Int
  readonly ilpReject: IlpReject

  constructor(log: Logger, ilpReject: IlpReject, frames?: Frame[], destinationAmount?: Int) {
    this.log = log
    this.ilpReject = ilpReject
    this.frames = frames
    this.destinationAmount = destinationAmount
  }

  isAuthentic(): boolean {
    return !!this.frames && !!this.destinationAmount
  }

  isReject(): this is StreamReject {
    return true
  }

  isFulfill(): this is StreamFulfill {
    return false
  }
}
