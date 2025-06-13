import * as crypto from 'crypto'
import { IlpFulfill } from 'ilp-packet'
import {
  Packet as StreamPacket,
  IlpPacketType
} from 'ilp-protocol-stream/dist/src/packet'
import { createILPContext } from '../../utils'
import {
  createStreamController,
  streamReceivedKey
} from '../../controllers/stream'
import {
  IncomingPaymentAccountFactory,
  IncomingPeerFactory,
  OutgoingPeerFactory,
  IlpPrepareFactory,
  RafikiServicesFactory
} from '../../factories'
import { ZeroCopyIlpPrepare } from '../../middleware/ilp-packet'
import { StreamServer } from '@interledger/stream-receiver'

const sha256 = (preimage: string | Buffer): Buffer =>
  crypto.createHash('sha256').update(preimage).digest()
const hmac = (key: Buffer, message: Buffer): Buffer =>
  crypto.createHmac('sha256', key).update(message).digest()

describe('Stream Controller', function () {
  const alice = IncomingPeerFactory.build()
  const controller = createStreamController()
  const services = RafikiServicesFactory.build()

  afterAll(async () => {
    await services.redis.flushdb()
    await services.redis.quit()
  })

  test('constructs a reply for a receive account', async () => {
    const bob = IncomingPaymentAccountFactory.build()

    const streamServer = new StreamServer({
      serverAddress: services.config.ilpAddress,
      serverSecret: services.config.streamSecret
    })

    const { ilpAddress, sharedSecret } = streamServer.generateCredentials({
      paymentTag: 'foo'
    })

    const ctx = createILPContext({
      services,
      state: {
        streamServer,
        streamDestination: streamServer.decodePaymentTag(ilpAddress)
      },
      accounts: {
        get incoming() {
          return alice
        },
        get outgoing() {
          return bob
        }
      }
    })

    const key = hmac(sharedSecret, Buffer.from('ilp_stream_encryption'))
    const data = await new StreamPacket(
      100,
      IlpPacketType.Prepare,
      50
    ).serializeAndEncrypt(key)
    const fulfillmentKey = hmac(
      sharedSecret,
      Buffer.from('ilp_stream_fulfillment')
    )
    const fulfillment = hmac(fulfillmentKey, data)
    const executionCondition = sha256(fulfillment)
    ctx.request.prepare = new ZeroCopyIlpPrepare(
      IlpPrepareFactory.build({
        amount: '1000',
        destination: ilpAddress,
        executionCondition,
        data
      })
    )

    const next = jest.fn()
    await expect(controller(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalledTimes(0)
    const connectionKey = streamReceivedKey(
      sha256(ctx.request.prepare.destination).toString('hex')
    )
    await expect(services.redis.get(connectionKey)).resolves.toEqual(
      ctx.request.prepare.amount
    )
    const reply = ctx.response.reply as IlpFulfill
    expect(reply.fulfillment).toEqual(fulfillment)
    const replyPacket = await StreamPacket.decryptAndDeserialize(
      key,
      reply.data
    )
    expect(+replyPacket.sequence).toBe(100)
    expect(+replyPacket.prepareAmount).toBe(+ctx.request.prepare.amount)
    expect(replyPacket.frames.length).toBe(0) // No `StreamReceipt` frame
    expect(ctx.revertTotalReceived).toEqual(expect.any(Function))
    await expect(
      ctx.revertTotalReceived && ctx.revertTotalReceived()
    ).resolves.toEqual('0')
    await expect(services.redis.get(connectionKey)).resolves.toBe('0')
  })

  test("skips when the payment tag can't be decrypted", async () => {
    const bob = IncomingPaymentAccountFactory.build()
    const ctx = createILPContext({
      services,
      request: {
        prepare: new ZeroCopyIlpPrepare(IlpPrepareFactory.build({})),
        rawPrepare: Buffer.alloc(0) // ignored
      },
      accounts: {
        get incoming() {
          return alice
        },
        get outgoing() {
          return bob
        }
      }
    })
    const next = jest.fn()
    await expect(controller(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reply).toBeUndefined()
    expect(ctx.revertTotalReceived).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('skips when not a receive account', async () => {
    const bob = OutgoingPeerFactory.build()
    const ctx = createILPContext({
      services,
      accounts: {
        get incoming() {
          return alice
        },
        get outgoing() {
          return bob
        }
      }
    })
    const next = jest.fn()
    await expect(controller(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reply).toBeUndefined()
    expect(ctx.revertTotalReceived).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
