import * as crypto from 'crypto'
import { StreamServer } from '@interledger/stream-receiver'
import { createContext } from '../../utils'
import { RafikiContext } from '../../rafiki'
import { createStreamController } from '../../controllers/stream'
import {
  AccountFactory,
  PeerAccountFactory,
  IlpPrepareFactory
} from '../../factories'
import { ZeroCopyIlpPrepare } from '../../middleware/ilp-packet'

describe('Stream Controller', function () {
  const alice = PeerAccountFactory.build()
  const serverOptions = {
    serverAddress: 'test.rafiki',
    serverSecret: crypto.randomBytes(32)
  }
  const controller = createStreamController(serverOptions)
  const server = new StreamServer(serverOptions)

  test('constructs a reply when "stream" is enabled', async () => {
    const bob = AccountFactory.build({ stream: { enabled: true } })
    const ctx = createContext<unknown, RafikiContext>()
    const { ilpAddress } = server.generateCredentials({ paymentTag: 'foo' })
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
  })

  test("skips when the payment tag can't be decrypted", async () => {
    const bob = AccountFactory.build({ stream: { enabled: true } })
    const ctx = createContext<unknown, RafikiContext>()
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
