import * as crypto from 'crypto'
import { createContext } from '../../utils'
import { RafikiContext } from '../../rafiki'
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

const sha256 = (preimage: string): string =>
  crypto.createHash('sha256').update(preimage).digest('hex')

describe('Stream Controller', function () {
  const alice = PeerAccountFactory.build()
  const controller = createStreamController()
  const services = RafikiServicesFactory.build()

  afterAll(async () => {
    await services.redis.disconnect()
  })

  test('constructs a reply when "stream" is enabled', async () => {
    const bob = AccountFactory.build({ stream: { enabled: true } })
    const ctx = createContext<unknown, RafikiContext>()
    const { ilpAddress } = services.streamServer.generateCredentials({
      paymentTag: 'foo'
    })
    ctx.services = services
    ctx.request.prepare = new ZeroCopyIlpPrepare(
      IlpPrepareFactory.build({ destination: ilpAddress })
    )
    ctx.accounts = {
      get incoming() {
        return alice
      },
      get outgoing() {
        return bob
      }
    }
    const next = jest.fn()
    await expect(controller(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reply).toEqual({
      code: 'F06',
      message: '',
      triggeredBy: 'test.rafiki',
      data: Buffer.alloc(0)
    })
    expect(next).toHaveBeenCalledTimes(0)
    expect(
      await services.redis.get(
        streamReceivedKey(sha256(ctx.request.prepare.destination))
      )
    ).toBeNull()
  })

  test("skips when the payment tag can't be decrypted", async () => {
    const bob = AccountFactory.build({ stream: { enabled: true } })
    const ctx = createContext<unknown, RafikiContext>()
    ctx.services = services
    ctx.request.prepare = new ZeroCopyIlpPrepare(IlpPrepareFactory.build({}))
    ctx.accounts = {
      get incoming() {
        return alice
      },
      get outgoing() {
        return bob
      }
    }
    const next = jest.fn()
    await expect(controller(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reply).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('skips when "stream" is not set', async () => {
    const bob = AccountFactory.build()
    const ctx = createContext<unknown, RafikiContext>()
    ctx.services = services
    ctx.accounts = {
      get incoming() {
        return alice
      },
      get outgoing() {
        return bob
      }
    }
    const next = jest.fn()
    await expect(controller(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reply).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('skips when "stream.enabled" is false', async () => {
    const bob = AccountFactory.build({ stream: { enabled: false } })
    const ctx = createContext<unknown, RafikiContext>()
    ctx.services = services
    ctx.accounts = {
      get incoming() {
        return alice
      },
      get outgoing() {
        return bob
      }
    }
    const next = jest.fn()
    await expect(controller(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reply).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
