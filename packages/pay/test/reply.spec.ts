/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from '@jest/globals'
import { randomBytes } from 'crypto'
import createLogger from 'ilp-logger'
import {
  deserializeIlpPrepare,
  IlpAddress,
  IlpError,
  serializeIlpFulfill,
  serializeIlpPrepare,
  serializeIlpReject,
} from 'ilp-packet'
import {
  ConnectionDataBlockedFrame,
  ConnectionMaxStreamIdFrame,
  IlpPacketType,
  Packet,
} from 'ilp-protocol-stream/dist/src/packet'
import { generateKeys, StreamReject } from '../src/request'
import { generateEncryptionKey, generateFulfillmentKey, hmac, Int } from '../src/utils'

const destinationAddress = 'private.bob' as IlpAddress
const sharedSecret = randomBytes(32)
const expiresAt = new Date(Date.now() + 30000)
const log = createLogger('ilp-pay')

describe('validates replies', () => {
  it('returns F01 if reply is not Fulfill or Reject', async () => {
    const sendData = async () =>
      serializeIlpPrepare({
        destination: 'private.foo',
        executionCondition: randomBytes(32),
        expiresAt: new Date(Date.now() + 10000),
        amount: '1',
        data: Buffer.alloc(0),
      })

    const sendRequest = await generateKeys({ sendData }, sharedSecret)

    const reply = await sendRequest({
      destinationAddress,
      expiresAt,
      sequence: 20,
      sourceAmount: Int.from(100)!,
      minDestinationAmount: Int.from(99)!,
      isFulfillable: true,
      frames: [],
      log,
    })

    expect(reply.destinationAmount).toBeUndefined()
    expect(reply.frames).toBeUndefined()

    expect(reply.isReject())
    expect((reply as StreamReject).ilpReject.code).toBe(IlpError.F01_INVALID_PACKET)
  })

  it('returns R00 if packet times out', async () => {
    // Data handler never resolves
    const sendData = () => new Promise<Buffer>(() => {})

    const sendRequest = await generateKeys({ sendData }, sharedSecret)

    const reply = await sendRequest({
      destinationAddress,
      expiresAt: new Date(Date.now() + 1000), // Short expiry so test completes quickly
      sequence: 31,
      sourceAmount: Int.from(100)!,
      minDestinationAmount: Int.from(99)!,
      isFulfillable: true,
      frames: [],
      log,
    })

    expect(reply.destinationAmount).toBeUndefined()
    expect(reply.frames).toBeUndefined()

    expect(reply.isReject())
    expect((reply as StreamReject).ilpReject.code).toBe(IlpError.R00_TRANSFER_TIMED_OUT)
  })

  it('returns T00 if the plugin throws an error', async () => {
    const sendData = async () => {
      throw new Error('Unable to process request')
    }

    const sendRequest = await generateKeys({ sendData }, sharedSecret)

    const reply = await sendRequest({
      destinationAddress,
      expiresAt,
      sequence: 20,
      sourceAmount: Int.from(100)!,
      minDestinationAmount: Int.from(99)!,
      isFulfillable: true,
      frames: [],
      log,
    })

    expect(reply.destinationAmount).toBeUndefined()
    expect(reply.frames).toBeUndefined()

    expect(reply.isReject())
    expect((reply as StreamReject).ilpReject.code).toBe(IlpError.T00_INTERNAL_ERROR)
  })

  it('returns F05 on invalid fulfillment', async () => {
    const sendData = async () =>
      serializeIlpFulfill({
        fulfillment: randomBytes(32),
        data: Buffer.alloc(0),
      })

    const sendRequest = await generateKeys({ sendData }, sharedSecret)

    const reply = await sendRequest({
      destinationAddress,
      expiresAt,
      sequence: 20,
      sourceAmount: Int.from(100)!,
      minDestinationAmount: Int.from(99)!,
      isFulfillable: true,
      frames: [],
      log,
    })

    expect(reply.destinationAmount).toBeUndefined()
    expect(reply.frames).toBeUndefined()

    expect(reply.isReject())
    expect((reply as StreamReject).ilpReject.code).toBe(IlpError.F05_WRONG_CONDITION)
  })

  it('discards STREAM reply with invalid sequence', async () => {
    const sendData = async (data: Buffer) => {
      const prepare = deserializeIlpPrepare(data)

      const streamReply = new Packet(1, IlpPacketType.Fulfill, 100, [
        new ConnectionMaxStreamIdFrame(30), // Some random frame
      ])

      return serializeIlpFulfill({
        fulfillment: hmac(fulfillmentKey, prepare.data),
        data: await streamReply.serializeAndEncrypt(encryptionKey),
      })
    }

    const encryptionKey = generateEncryptionKey(sharedSecret)
    const fulfillmentKey = generateFulfillmentKey(sharedSecret)

    const sendRequest = await generateKeys({ sendData }, sharedSecret)

    const reply = await sendRequest({
      destinationAddress,
      expiresAt,
      sequence: 20,
      sourceAmount: Int.from(100)!,
      minDestinationAmount: Int.from(99)!,
      isFulfillable: true,
      frames: [],
      log,
    })

    // Discards reply since the sequence # is not the same as the request
    expect(reply.destinationAmount).toBeUndefined()
    expect(reply.frames).toBeUndefined()

    expect(reply.isFulfill())
  })

  it('discards STREAM reply if packet type is invalid', async () => {
    const sendData = async (data: Buffer) => {
      const prepare = deserializeIlpPrepare(data)

      // Receiver is claiming the packet is a reject, even though it's a Fulfill
      const streamReply = new Packet(1, IlpPacketType.Reject, 100, [
        new ConnectionDataBlockedFrame(0), // Some random frame
      ])

      return serializeIlpFulfill({
        fulfillment: hmac(fulfillmentKey, prepare.data),
        data: await streamReply.serializeAndEncrypt(encryptionKey),
      })
    }

    const encryptionKey = generateEncryptionKey(sharedSecret)
    const fulfillmentKey = generateFulfillmentKey(sharedSecret)

    const sendRequest = await generateKeys({ sendData }, sharedSecret)

    const reply = await sendRequest({
      destinationAddress,
      expiresAt,
      sequence: 1,
      sourceAmount: Int.from(100)!,
      minDestinationAmount: Int.from(99)!,
      isFulfillable: true,
      frames: [],
      log,
    })

    // Discards reply since packet type was invalid
    expect(reply.destinationAmount).toBeUndefined()
    expect(reply.frames).toBeUndefined()

    expect(reply.isFulfill())
  })

  it('handles replies when decryption fails', async () => {
    const replyData = randomBytes(100)
    const sendData = async () =>
      serializeIlpReject({
        code: IlpError.F07_CANNOT_RECEIVE,
        message: '',
        triggeredBy: '',
        data: replyData,
      })

    const sendRequest = await generateKeys({ sendData }, sharedSecret)

    const reply = await sendRequest({
      destinationAddress,
      expiresAt,
      sequence: 1,
      sourceAmount: Int.from(100)!,
      minDestinationAmount: Int.from(99)!,
      isFulfillable: true,
      frames: [],
      log,
    })

    // No STREAM packet could be decrypted
    expect(reply.destinationAmount).toBeUndefined()
    expect(reply.frames).toBeUndefined()

    expect(reply.isReject())
    expect((reply as StreamReject).ilpReject.code).toBe(IlpError.F07_CANNOT_RECEIVE)
    expect((reply as StreamReject).ilpReject.data).toEqual(replyData)
  })
})
