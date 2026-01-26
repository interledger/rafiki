import { isValidAssetScale } from 'ilp-protocol-ildcp'
import { Writer, Reader } from 'oer-utils'
import createLogger from 'ilp-logger'
import {
  IlpReject,
  IlpPrepare,
  IlpFulfill,
  IlpPacketType,
  IlpAddress,
  isValidIlpAddress,
  IlpError,
  IlpReply,
} from 'ilp-packet'
import { hmac, sha256, base64url, ReplyBuilder, decrypt, encrypt } from './utils'
import {
  Packet,
  ConnectionCloseFrame,
  FrameType,
  ErrorCode,
  ConnectionAssetDetailsFrame,
  StreamReceiptFrame,
  StreamDataFrame,
} from 'ilp-protocol-stream/dist/src/packet'
import { LongValue } from 'ilp-protocol-stream/dist/src/util/long'
import { createReceipt } from 'ilp-protocol-stream/dist/src/util/receipt'
import Long from 'long'

/** Parameters to statelessly generate new STREAM connections and handle incoming packets for STREAM connections. */
export interface ServerOptions {
  /** Secret used to statelessly generate credentials for incoming STREAM connections. */
  serverSecret: Buffer

  /** Base ILP address of this STREAM server to access it over the Interledger network. */
  serverAddress: string
}

/** Credentials for a client to setup a STREAM connection with a STREAM server */
export interface StreamCredentials {
  /** ILP address of the recipient account, identifying this connection, for the client to send packets to this STREAM server. */
  ilpAddress: IlpAddress

  /** 32-byte seed to encrypt and decrypt STREAM messages, and generate ILP packet fulfillments. */
  sharedSecret: Buffer
}

/** Pending STREAM request and in-flight ILP Prepare with funds that may be fulfilled or rejected. */
export interface IncomingMoney {
  /** Unique identifier of this STREAM connection: SHA-256 hash of destination ILP address with token, hex-encoded */
  connectionId: string

  /** Arbitrary data to attribute or handle an incoming payment, encoded when the credentials were generated. */
  paymentTag?: string

  /**
   * Sign and include and STREAM receipt for the total amount received on this STREAM connection, per `connectionId`,
   * including the additional amount from this packet. Amount must be within the u64 range.
   */
  setTotalReceived(totalReceived: LongValue): void

  /** Fulfill the money from this incoming ILP Prepare packet */
  accept(): IlpFulfill

  /** Temporarily decline the incoming money: inform STREAM sender to backoff in time (T00 Reject: Temporary Internal Error) */
  temporaryDecline(): IlpReject

  /** Inform the sender to close their connection */
  finalDecline(): IlpReject

  /** Application StreamData frames carried on this Prepare (if any) */
  dataFrames?: StreamDataFrame[]
}

/** Application-layer metadata to encode within the credentials of a new STREAM connection. */
interface ConnectionDetails {
  /**
   * Arbitrary data to attribute or handle an incoming payment. For example, an identifier to
   * correlate which user account the payment should be credited to.
   */
  paymentTag?: string

  /** Parameters to generate authentic STREAM receipts so a third party may verify incoming payments. */
  receiptSetup?: {
    secret: Buffer
    nonce: Buffer
  }

  /**
   * Destination asset details of the recipient's Interledger account, to share with the sender.
   * Note: required for SPSP, but unnecessary for Open Payments credentials.
   */
  asset?: {
    code: string
    scale: number
  }
}

/**
 * Format of destination ILP address:
 * serverAddress + "." + base64url(encrypt(connectionToken, serverSecret))
 * - Encrypted with AES-256-GCM
 * - Random 12-byte IV ensures uniqueness
 *
 * connectionToken schema:
 * ===================================
 *
 * - `flags`         -- UInt8 -- Bit string of enabled features: (1) payment tag, (2) receipt details, (3) asset details
 *
 *   (If payment tag is enabled...)
 * - `paymentTag`    -- VarOctetString
 *
 *   (If receipts are enabled...)
 * - `receiptNonce`  -- 16 raw bytes
 * - `receiptSecret` -- 32 raw bytes
 *
 *   (If asset details are enabled...)
 * - `assetCode`     -- VarOctetString
 * - `assetScale`    -- UInt8
 */

/**
 * Generate and validate STREAM connection credentials so a client may send packets to the STREAM server.
 * This enables an Open Payments or SPSP server to generate new connections separately from the STREAM server
 * and ILP-connected infrastructure, so long as they are configured with the same server secret and ILP address.
 */
export class StreamServer {
  /** Constant to derive key to encrypt connection tokens in the ILP address */
  private static TOKEN_GENERATION_STRING = Buffer.from('ilp_stream_connection_token')

  /** Constant to derive shared secrets, combined with the connection token */
  private static SHARED_SECRET_GENERATION_STRING = Buffer.from('ilp_stream_shared_secret')

  /** Constant to derive packet decryption key, combined with the shared secret */
  private static ENCRYPTION_KEY_STRING = Buffer.from('ilp_stream_encryption')

  /** Constant to derive packet fulfillments, combined with the shared secret */
  private static FULFILLMENT_GENERATION_STRING = Buffer.from('ilp_stream_fulfillment')

  /** Pre-allocated Buffer to serialize connection tokens (safe since `generateCredentials` is synchronous) */
  private static TOKEN_GENERATION_BUFFER = Buffer.alloc(767) // Max # of base64 characters in ILP address

  /** Flag bits to flip to determine enabled features */
  private static TOKEN_FLAGS = {
    PAYMENT_TAG: 1, // 2^0
    RECEIPTS: 2, // 2^1
    ASSET_DETAILS: 4, // 2^2
  }

  /** Base ILP address of the server accessible over its Interledger network */
  private serverAddress: IlpAddress

  /** Derived key for generating shared secrets */
  private sharedSecretKeyGen: Buffer

  /** Derived key for generating connection tokens */
  private connectionTokenKeyGen: Buffer

  constructor({ serverSecret, serverAddress }: ServerOptions) {
    if (serverSecret.byteLength !== 32) {
      throw new Error('Server secret must be 32 bytes')
    }

    if (!isValidIlpAddress(serverAddress)) {
      throw new Error('Invalid server base ILP address')
    }

    this.serverAddress = serverAddress
    this.sharedSecretKeyGen = hmac(serverSecret, StreamServer.SHARED_SECRET_GENERATION_STRING)
    this.connectionTokenKeyGen = hmac(serverSecret, StreamServer.TOKEN_GENERATION_STRING)
  }

  /**
   * Generate credentials to return to a STREAM client so they may establish a connection to this STREAM server.
   * Throws if the receipt nonce or secret are invalid lengths, the asset scale was not 0-255,
   * or that data cannot fit within an ILP address.
   */
  generateCredentials(options: ConnectionDetails = {}): StreamCredentials {
    const { receiptSetup, asset } = options

    if (receiptSetup) {
      if (receiptSetup.nonce.byteLength !== 16) {
        throw new Error('Failed to generate credentials: receipt nonce must be 16 bytes')
      }

      if (receiptSetup.secret.byteLength !== 32) {
        throw new Error('Failed to generate credentials: receipt secret must be 32 bytes')
      }
    }

    if (asset && !isValidAssetScale(asset.scale)) {
      throw new Error('Failed to generate credentials: invalid asset scale')
    }

    const paymentTag = options.paymentTag ? Buffer.from(options.paymentTag, 'ascii') : undefined

    const flags =
      (paymentTag ? StreamServer.TOKEN_FLAGS.PAYMENT_TAG : 0) |
      (receiptSetup ? StreamServer.TOKEN_FLAGS.RECEIPTS : 0) |
      (asset ? StreamServer.TOKEN_FLAGS.ASSET_DETAILS : 0)

    const writer = new Writer(StreamServer.TOKEN_GENERATION_BUFFER)
    writer.writeUInt8(flags)

    if (paymentTag) {
      writer.writeVarOctetString(paymentTag)
    }

    if (receiptSetup) {
      writer.write(receiptSetup.nonce)
      writer.write(receiptSetup.secret)
    }

    if (asset) {
      writer.writeVarOctetString(Buffer.from(asset.code, 'utf8'))
      writer.writeUInt8(asset.scale)
    }

    const token = encrypt(this.connectionTokenKeyGen, writer.getBuffer())
    const sharedSecret = hmac(this.sharedSecretKeyGen, token)

    const destinationAddress = `${this.serverAddress}.${base64url(token)}`
    if (!isValidIlpAddress(destinationAddress)) {
      throw new Error(
        'Failed to generate credentials: too much data to encode within an ILP address'
      )
    }

    return {
      ilpAddress: destinationAddress,
      sharedSecret,
    }
  }

  private extractLocalAddressSegment(destinationAddress: string): string | undefined {
    const localAddressParts = destinationAddress.slice(this.serverAddress.length + 1).split('.')
    if (destinationAddress.startsWith(this.serverAddress + '.') && !!localAddressParts[0]) {
      return localAddressParts[0]
    }
  }

  private decryptToken(token: Buffer): ConnectionDetails | undefined {
    try {
      const details: ConnectionDetails = {}
      const decryptedToken = decrypt(this.connectionTokenKeyGen, token)

      const reader = new Reader(decryptedToken)
      const flags = reader.readUInt8Number()

      const hasPaymentTag = (flags & StreamServer.TOKEN_FLAGS.PAYMENT_TAG) !== 0
      const hasReceiptDetails = (flags & StreamServer.TOKEN_FLAGS.RECEIPTS) !== 0
      const hasAssetDetails = (flags & StreamServer.TOKEN_FLAGS.ASSET_DETAILS) !== 0

      if (hasPaymentTag) {
        details.paymentTag = reader.readVarOctetString().toString('ascii')
      }

      if (hasReceiptDetails) {
        details.receiptSetup = {
          nonce: reader.read(16),
          secret: reader.read(32),
        }
      }

      if (hasAssetDetails) {
        details.asset = {
          code: reader.readVarOctetString().toString(),
          scale: reader.readUInt8Number(),
        }
      }

      return details
    } catch (_) {
      // No-op: failed decryption or structurally invalid
    }
  }

  /**
   * Extract the `paymentTag` from the given destination ILP address, or return `undefined`
   * if the connection token is invalid or no payment tag was encoded.
   */
  decodePaymentTag(destinationAddress: string): string | void {
    const token = this.extractLocalAddressSegment(destinationAddress)
    if (token) {
      return this.decryptToken(Buffer.from(token, 'base64'))?.paymentTag
    }
  }

  /**
   * Validate and decrypt the destination ILP address of an incoming ILP Prepare:
   * ensure it's addressed to the server and decode encrypted metadata to attribute and handle the payment.
   */
  createReply(prepare: IlpPrepare): IncomingMoney | IlpReply {
    const connectionId = sha256(Buffer.from(prepare.destination, 'ascii')).toString('hex')
    const log = createLogger(`ilp-receiver:${connectionId.slice(0, 6)}`)
    const reply = new ReplyBuilder().setIlpAddress(this.serverAddress)

    // Ensure the packet is addressed to us
    const localSegment = this.extractLocalAddressSegment(prepare.destination)
    if (!localSegment) {
      log.trace('got packet not addressed to the receiver. destination=%s', prepare.destination)
      return reply.buildReject(IlpError.F02_UNREACHABLE)
    }

    const token = Buffer.from(localSegment, 'base64')
    const connectionDetails = this.decryptToken(token)
    if (!connectionDetails) {
      log.trace(
        'invalid connection token: cannot attribute incoming packet. token=%s',
        localSegment
      )
      return reply.buildReject(IlpError.F06_UNEXPECTED_PAYMENT)
    }
    const { paymentTag, receiptSetup, asset } = connectionDetails

    log.debug('got incoming Prepare. amount: %s', prepare.amount)

    const sharedSecret = hmac(this.sharedSecretKeyGen, token)
    const encryptionKey = hmac(sharedSecret, StreamServer.ENCRYPTION_KEY_STRING)
    let streamRequest: Packet
    try {
      streamRequest = Packet._deserializeUnencrypted(decrypt(encryptionKey, prepare.data))
    } catch (_) {
      log.trace('rejecting with F06: failed to decrypt STREAM data') // Inauthentic, could be anyone
      return reply.buildReject(IlpError.F06_UNEXPECTED_PAYMENT)
    }

    if (+streamRequest.ilpPacketType !== IlpPacketType.Prepare) {
      log.warn('rejecting with F00: invalid STREAM packet type') // Sender violated protocol, or intermediaries swapped valid STREAM packets
      return reply.buildReject(IlpError.F00_BAD_REQUEST) // Client should not retry, but don't include STREAM data since the request was inauthentic
    }

    log.debug(
      'got authentic STREAM request. sequence: %s, min destination amount: %s',
      streamRequest.sequence,
      streamRequest.prepareAmount
    )
    log.trace('STREAM request frames: %o', streamRequest.frames)

    const dataFrames = streamRequest.frames.filter(
      (f): f is StreamDataFrame => f.type === FrameType.StreamData,
    )

    reply
      .setEncryptionKey(encryptionKey)
      .setSequence(streamRequest.sequence)
      .setReceivedAmount(prepare.amount)

    const closeFrame = streamRequest.frames.find(
      (frame): frame is ConnectionCloseFrame => frame.type === FrameType.ConnectionClose
    )
    if (closeFrame) {
      log.trace(
        'client closed connection, rejecting with F99. code="%s" message="%s"',
        ErrorCode[closeFrame.errorCode],
        closeFrame.errorMessage
      )
      // Echo connection closes from the client
      return reply
        .addFrames(new ConnectionCloseFrame(ErrorCode.NoError, ''))
        .buildReject(IlpError.F99_APPLICATION_ERROR)
    }

    const isNewConnection = streamRequest.frames.some(
      (frame) => frame.type === FrameType.ConnectionNewAddress
    )
    if (isNewConnection && asset) {
      log.trace(
        'got new client address, replying with asset details: %s %s',
        asset.code,
        asset.scale
      )
      reply.addFrames(new ConnectionAssetDetailsFrame(asset.code, asset.scale))
    }

    /**
     * Why no `StreamMaxMoney` frame in the reply?
     * - Limits on how much money can be received should probably be negotiated
     *   at the application layer instead of STREAM. The API consumer can optionally
     *   limit the amount received by declining incoming money, and by default, STREAM
     *   senders assume there's no limit on the remote maximum
     * - `ilp-protocol-stream` sender does not publicly expose the remote amount
     *   received on each individual stream (it's only tracked for backpressure),
     *   so it's unnecessary to reply with the total received on a per-stream basis
     */

    const receivedAmount = Long.fromString(prepare.amount, true)
    const didReceiveMinimum = receivedAmount.greaterThanOrEqual(streamRequest.prepareAmount)
    if (!didReceiveMinimum) {
      return reply.buildReject(IlpError.F99_APPLICATION_ERROR)
    }

    const fulfillmentKey = hmac(sharedSecret, StreamServer.FULFILLMENT_GENERATION_STRING)
    const fulfillment = hmac(fulfillmentKey, prepare.data)
    const isFulfillable = sha256(fulfillment).equals(prepare.executionCondition)
    if (!isFulfillable) {
      return reply.buildReject(IlpError.F99_APPLICATION_ERROR)
    } else if (receivedAmount.isZero()) {
      /**
       * `ilp-protocol-stream` as a client sometimes handles replies differently if they're sent back in an
       *  ILP Fulfill vs an ILP Reject, so 0 amount packets should be fulfilled.
       *
       * For example, replying to a `StreamClose` frame with an F99 Reject in Node 10 results in an infinite loop,
       * since `ilp-protocol-stream` re-queues the frame and tries again. Replying with an ILP Fulfill prevents
       * this (no money is received since the amount is 0). This issue does not occur in Node 12 (?).
       *
       * https://github.com/interledgerjs/ilp-protocol-stream/blob/7ad483f5fd1a1d1e4dc58d7eef6a437594646260/src/connection.ts#L1499-L1505
       */
      return reply.buildFulfill(fulfillment)
    }

    return {
      connectionId,

      paymentTag,
      
      dataFrames: dataFrames.length > 0 ? dataFrames : undefined,

      setTotalReceived: (totalReceived: LongValue) => {
        if (receiptSetup) {
          /**
           * Even if we receive money over multiple streams with different stream IDs, we only generate
           * STREAM receipts for streamId=1. There should be no effect for the sender or verifier,
           * since the total amount credited to this receipt nonce will still be the same.
           *
           * Per RFC, client MUST open streams starting with streamId=1.
           */
          const receipt = createReceipt({
            ...receiptSetup,
            totalReceived,
            streamId: 1,
          })
          reply.addFrames(new StreamReceiptFrame(1, receipt))
        }
      },

      accept: () => reply.buildFulfill(fulfillment),

      temporaryDecline: () => reply.buildReject(IlpError.T00_INTERNAL_ERROR),

      finalDecline: () =>
        reply
          .addFrames(new ConnectionCloseFrame(ErrorCode.NoError, ''))
          .buildReject(IlpError.F99_APPLICATION_ERROR),
    }
  }
}
