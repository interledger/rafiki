import Faker from 'faker'
import { serializeIlpFulfill } from 'ilp-packet'
import { createILPContext } from '../../utils'
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
  const alice = PeerAccountFactory.build({ id: 'alice' })
  const bob = PeerAccountFactory.build({ id: 'bob' })
  const services = RafikiServicesFactory.build()
  const outgoing = {
    authToken: Faker.datatype.string(32),
    endpoint: Faker.internet.url()
  }
  const ctx = createILPContext({
    services,
    accounts: {
      get incoming() {
        return alice
      },
      get outgoing() {
        return bob
      }
    },
    state: { outgoing }
  })
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

    expect(sendToPeer.mock.calls[0][1]).toEqual(outgoing)
    expect(ctx.response.rawReply).toBeDefined()
  })
})
