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
  AccountFactory,
  PeerAccountFactory,
  IlpPrepareFactory,
  RafikiServicesFactory
} from '../../factories'
import { ZeroCopyIlpPrepare } from '../../middleware/ilp-packet'

const sha256 = (preimage: string | Buffer): Buffer =>
  crypto.createHash('sha256').update(preimage).digest()
const hmac = (key: Buffer, message: Buffer): Buffer =>
  crypto.createHmac('sha256', key).update(message).digest()

describe('Stream Controller', function () {
  const alice = PeerAccountFactory.build()
  const controller = createStreamController()
  const services = RafikiServicesFactory.build()

  afterAll(async () => {
    await services.redis.flushdb()
    await services.redis.disconnect()
  })

  test('constructs a reply when "stream" is enabled', async () => {
    const bob = AccountFactory.build({ stream: { enabled: true } })
    const {
      ilpAddress,
      sharedSecret
    } = services.streamServer.generateCredentials({
      paymentTag: 'foo'
    })
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
    expect(
      await services.redis.get(
        streamReceivedKey(
          sha256(ctx.request.prepare.destination).toString('hex')
        )
      )
    ).toBe(ctx.request.prepare.amount)

    const reply = ctx.response.reply as IlpFulfill
    expect(reply.fulfillment).toEqual(fulfillment)
    const replyPacket = await StreamPacket.decryptAndDeserialize(
      key,
      reply.data
    )
    expect(+replyPacket.sequence).toBe(100)
    expect(+replyPacket.prepareAmount).toBe(+ctx.request.prepare.amount)
    expect(replyPacket.frames.length).toBe(0) // No `StreamReceipt` frame
  })

  test("skips when the payment tag can't be decrypted", async () => {
    const bob = AccountFactory.build({ stream: { enabled: true } })
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
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('skips when "stream.enabled" is false', async () => {
    const bob = AccountFactory.build({ stream: { enabled: false } })
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
    expect(next).toHaveBeenCalledTimes(1)
  })
})
