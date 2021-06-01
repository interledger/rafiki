import { serializeIlpFulfill } from 'ilp-packet'
import { createContext } from '../../utils'
import { RafikiContext } from '../../rafiki'
import {
  IlpFulfillFactory,
  IlpPrepareFactory,
  PeerAccountFactory,
  RafikiServicesFactory
} from '../../factories'
import { createClientController } from '../../controllers/client'
import { ZeroCopyIlpPrepare } from '../../middleware/ilp-packet'

describe('Client Controller', function () {
  const fulfill = serializeIlpFulfill(IlpFulfillFactory.build())
  const sendToPeer = jest.fn().mockResolvedValue(fulfill)
  const alice = PeerAccountFactory.build({ accountId: 'alice' })
  const bob = PeerAccountFactory.build({ accountId: 'bob' })
  const services = RafikiServicesFactory.build()
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
  const controller = createClientController({ sendToPeer })
  const next = () => {
    throw new Error('unreachable')
  }

  beforeEach(function () {
    sendToPeer.mockClear()
  })

  test('sends packet to outgoing client', async () => {
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    await expect(controller(ctx, next)).resolves.toBeUndefined()

    expect(sendToPeer.mock.calls[0][1]).toEqual(bob)
    expect(ctx.response.rawReply).toBeDefined()
  })
})
