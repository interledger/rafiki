import { IlpPrepare, serializeIlpPrepare } from 'ilp-packet'
import { deserializeIldcpResponse } from 'ilp-protocol-ildcp'
import { createILPContext } from '../../utils'
import { ILPContext } from '../../rafiki'
import {
  IncomingAccountFactory,
  IncomingPeerFactory,
  OutgoingPeerFactory,
  IlpPrepareFactory,
  RafikiServicesFactory
} from '../../factories'
import { createIldcpMiddleware } from '../../middleware/ildcp'
import { ZeroCopyIlpPrepare } from '../../middleware/ilp-packet'

describe('ILDCP Middleware', function () {
  const alice = IncomingPeerFactory.build({ id: 'alice' })
  const self = OutgoingPeerFactory.build({ id: 'self' })
  const services = RafikiServicesFactory.build({})
  const middleware = createIldcpMiddleware('test.rafiki')

  function makeContext(prepare: IlpPrepare): ILPContext {
    return createILPContext({
      services,
      accounts: {
        get incoming() {
          return alice
        },
        get outgoing() {
          return self
        }
      },
      request: {
        prepare: new ZeroCopyIlpPrepare(prepare),
        rawPrepare: serializeIlpPrepare(prepare)
      }
    })
  }

  beforeAll(async () => {
    await services.accounting.create(self)
    await services.accounting.create(alice)
  })

  test('returns an ildcp response on success', async () => {
    const ctx = makeContext(
      IlpPrepareFactory.build({ destination: 'peer.config' })
    )
    const next = jest.fn()
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    const reply = deserializeIldcpResponse(
      ctx.response.rawReply || Buffer.alloc(0)
    )
    expect(reply.clientAddress).toEqual('test.alice')
    expect(reply.assetScale).toEqual(alice.asset.scale)
    expect(reply.assetCode).toEqual(alice.asset.code)
    expect(next).toHaveBeenCalledTimes(0)
  })

  test('calls "next" if destination is not peer.config', async () => {
    const ctx = makeContext(
      IlpPrepareFactory.build({ destination: 'test.foo' })
    )
    const next = jest.fn()
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('returns an ildcp response if incoming account is not a peer', async () => {
    const bob = await services.accounting.create(
      IncomingAccountFactory.build({ id: 'bob' })
    )
    const ctx = makeContext(
      IlpPrepareFactory.build({ destination: 'peer.config' })
    )
    ctx.accounts = {
      get incoming() {
        return bob
      },
      get outgoing() {
        return self
      }
    }
    const next = jest.fn()
    await expect(middleware(ctx, next)).rejects.toThrowError(
      'not a peer account'
    )
    expect(next).toHaveBeenCalledTimes(0)
  })
})
