import { IlpPrepare, serializeIlpPrepare } from 'ilp-packet'
import { deserializeIldcpResponse } from 'ilp-protocol-ildcp'
import { createContext } from '../../utils'
import { RafikiAccount, RafikiContext } from '../../rafiki'
import {
  AccountFactory,
  PeerAccountFactory,
  IlpPrepareFactory,
  RafikiServicesFactory
} from '../../factories'
import { createIldcpProtocolController } from '../../controllers/ildcp-protocol'
import { ZeroCopyIlpPrepare } from '../../middleware/ilp-packet'

describe('ILDCP Controller', function () {
  const alice = PeerAccountFactory.build({ id: 'alice' })
  const self = PeerAccountFactory.build({ id: 'self' })
  const services = RafikiServicesFactory.build({})
  const middleware = createIldcpProtocolController('test.rafiki')

  function makeContext(prepare: IlpPrepare): RafikiContext {
    const ctx = createContext<unknown, RafikiContext>()
    ctx.services = services
    ctx.accounts = {
      get incoming() {
        return alice
      },
      get outgoing() {
        return self
      }
    }
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    ctx.request.rawPrepare = serializeIlpPrepare(ctx.request.prepare)
    return ctx
  }

  beforeAll(async () => {
    await services.accounts.create(self)
    await services.accounts.create(alice)
  })

  test('returns an ildcp response on success', async () => {
    const ctx = makeContext(
      IlpPrepareFactory.build({ destination: 'peer.config' })
    )
    await expect(middleware(ctx)).resolves.toBeUndefined()

    const reply = deserializeIldcpResponse(
      ctx.response.rawReply || Buffer.alloc(0)
    )
    expect(reply.clientAddress).toEqual('test.alice')
    expect(reply.assetScale).toEqual(alice.asset.scale)
    expect(reply.assetCode).toEqual(alice.asset.code)
  })

  test('throws error if destination is not peer.config', async () => {
    const ctx = makeContext(
      IlpPrepareFactory.build({ destination: 'test.foo' })
    )
    await expect(middleware(ctx)).rejects.toThrowError(
      'Invalid address in ILDCP request'
    )
  })

  test.skip('returns an ildcp response if incoming account is not a peer', async () => {
    const bob = await services.accounts.create(
      AccountFactory.build({ id: 'bob' })
    )
    const ctx = makeContext(
      IlpPrepareFactory.build({ destination: 'peer.config' })
    )
    ctx.accounts = {
      get incoming() {
        return bob as RafikiAccount
      },
      get outgoing() {
        return self
      }
    }
    await expect(middleware(ctx)).rejects.toThrowError('not a peer account')
  })
})
