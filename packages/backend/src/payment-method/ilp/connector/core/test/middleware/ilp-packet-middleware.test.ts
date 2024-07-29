import assert from 'assert'
import { Readable } from 'stream'
import {
  serializeIlpPrepare,
  serializeIlpFulfill,
  deserializeIlpFulfill,
  serializeIlpReject,
  deserializeIlpReject
} from 'ilp-packet'
import { createContext, MockIncomingMessageOptions } from '../../utils'
import {
  createIlpPacketMiddleware,
  IlpResponse,
  ZeroCopyIlpPrepare,
  OutgoingAccount
} from '../../'
import {
  IlpPrepareFactory,
  IlpFulfillFactory,
  IlpRejectFactory,
  IncomingAccountFactory,
  RafikiServicesFactory
} from '../../factories'
import { HttpContext } from '../../rafiki'

describe('ILP Packet Middleware', () => {
  test('sets up request and response', async () => {
    const services = RafikiServicesFactory.build({})

    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }

    const ctx = createContext<unknown, HttpContext>({
      req: options,
      services: { ...services, telemetry: undefined }
    })

    const prepare = IlpPrepareFactory.build()
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const rawReply = serializeIlpFulfill(IlpFulfillFactory.build())
    const ilpHandler = jest.fn().mockImplementation((ctx, next) => {
      expect(ctx.request.prepare).toBeInstanceOf(ZeroCopyIlpPrepare)
      expect(ctx.request.rawPrepare).toEqual(serializeIlpPrepare(prepare))
      expect(ctx.response).toBeInstanceOf(IlpResponse)
      ctx.response.rawReply = rawReply
      next()
    })
    const next = jest.fn()
    const middleware = createIlpPacketMiddleware(ilpHandler, { getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ilpHandler).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.body).toEqual(rawReply)
  })
})

describe('IlpResponse', () => {
  let response: IlpResponse

  beforeEach(() => {
    response = new IlpResponse()
  })

  test('setting the fulfill sets the rawFulfill and clears the reject and rawReject', async () => {
    response.reject = IlpRejectFactory.build()
    expect(response.reject).toBeDefined()
    expect(response.rawReject).toBeDefined()

    const fulfill = IlpFulfillFactory.build()
    response.fulfill = fulfill
    expect(response.reject).toBeUndefined()
    expect(response.rawReject).toBeUndefined()
    expect(response.fulfill).toEqual(fulfill)
    expect(serializeIlpFulfill(fulfill)).toEqual(response.rawFulfill)
  })

  test('setting the rawFulfill sets the fulfill and clears the reject and rawReject', async () => {
    response.reject = IlpRejectFactory.build()
    expect(response.reject).toBeDefined()
    expect(response.rawReject).toBeDefined()

    const fulfill = IlpFulfillFactory.build()
    response.rawFulfill = serializeIlpFulfill(fulfill)
    expect(response.reject).toBeUndefined()
    expect(response.rawReject).toBeUndefined()
    expect(response.fulfill).toEqual(fulfill)
    expect(serializeIlpFulfill(fulfill)).toEqual(response.rawFulfill)
  })

  test('setting the reject sets the rawReject and clears the fulfill and rawFulfill', async () => {
    response.fulfill = IlpFulfillFactory.build()
    expect(response.fulfill).toBeDefined()
    expect(response.rawFulfill).toBeDefined()

    const reject = IlpRejectFactory.build()
    response.reject = reject
    expect(response.fulfill).toBeUndefined()
    expect(response.rawFulfill).toBeUndefined()
    expect(response.reject).toEqual(reject)
    expect(serializeIlpReject(reject)).toEqual(response.rawReject)
  })

  test('setting the rawReject sets the reject and clears the fulfill and rawFulfill', async () => {
    response.fulfill = IlpFulfillFactory.build()
    expect(response.fulfill).toBeDefined()
    expect(response.rawFulfill).toBeDefined()

    const reject = IlpRejectFactory.build()
    response.rawReject = serializeIlpReject(reject)
    expect(response.fulfill).toBeUndefined()
    expect(response.rawFulfill).toBeUndefined()
    expect(response.reject).toEqual(reject)
    expect(serializeIlpReject(reject)).toEqual(response.rawReject)
  })

  test('setting the reply as undefined clears the fulfill', async () => {
    response.reply = IlpFulfillFactory.build()
    expect(response.fulfill).toBeDefined()
    expect(response.rawFulfill).toBeDefined()

    response.reply = undefined
    expect(response.fulfill).toBeUndefined()
    expect(response.rawFulfill).toBeUndefined()
  })

  test('setting the reply as undefined clears the reject', async () => {
    response.reply = IlpRejectFactory.build()
    expect(response.reject).toBeDefined()
    expect(response.rawReject).toBeDefined()

    response.reply = undefined
    expect(response.reject).toBeUndefined()
    expect(response.rawReject).toBeUndefined()
  })

  test('setting the reply as a fulfill sets the fulfill and rawFulfill', async () => {
    const fulfill = IlpFulfillFactory.build()
    response.reply = fulfill
    expect(response.fulfill).toEqual(fulfill)
    expect(response.rawFulfill).toEqual(serializeIlpFulfill(fulfill))
  })

  test('setting the reply as a reject sets the reject and rawReject', async () => {
    const reject = IlpRejectFactory.build()
    response.reply = reject // set the fulfill after the getters and setters have been attached

    expect(response.reject).toEqual(reject)
    expect(response.rawReject).toEqual(serializeIlpReject(reject))
  })

  test('setting the rawReply as rawFulfill sets the fulfill and rawFulfill', async () => {
    const rawFulfill = serializeIlpFulfill(IlpFulfillFactory.build())
    response.rawReply = rawFulfill // set the fulfill after the getters and setters have been attached

    expect(response.fulfill).toEqual(deserializeIlpFulfill(rawFulfill))
    expect(response.rawFulfill).toEqual(rawFulfill)
  })

  test('setting the rawReply as rawReject sets the reject and rawReject', async () => {
    const rawReject = serializeIlpReject(IlpRejectFactory.build())
    response.rawReply = rawReject

    expect(response.reject).toEqual(deserializeIlpReject(rawReject))
    expect(response.rawReject).toEqual(rawReject)
  })

  test('setting the rawReply as undefined clears the reject and rawReject', async () => {
    response.rawReject = serializeIlpReject(IlpRejectFactory.build())
    expect(response.reject).toBeDefined()
    expect(response.rawReject).toBeDefined()

    response.rawReply = undefined
    expect(response.reject).toBeUndefined()
    expect(response.rawReject).toBeUndefined()
  })

  test('setting the rawReply as undefined clears the fulfill and rawFulfill', async () => {
    response.rawFulfill = serializeIlpFulfill(IlpFulfillFactory.build())
    expect(response.fulfill).toBeDefined()
    expect(response.rawFulfill).toBeDefined()

    response.rawReply = undefined
    expect(response.fulfill).toBeUndefined()
    expect(response.rawFulfill).toBeUndefined()
  })
})

describe('Telemetry Collection In ILP Packet Middleware', function () {
  let ctx: HttpContext
  let services: ReturnType<typeof RafikiServicesFactory.build>
  let incomingAccount: ReturnType<typeof IncomingAccountFactory.build>

  beforeEach(() => {
    services = RafikiServicesFactory.build({})
    incomingAccount = IncomingAccountFactory.build({ id: 'alice' })
    assert.ok(incomingAccount.id)
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    ctx = createContext<unknown, HttpContext>({
      req: options,
      services,
      accounts: {
        incoming: incomingAccount,
        outgoing: { asset: { code: 'USD', scale: 2 } } as OutgoingAccount
      },
      state: {
        unfulfillable: false,
        incomingAccount: {
          asset: {
            code: 'USD',
            scale: 2
          }
        }
      }
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should not gather telemetry if telemetry is not enabled (service is undefined)', async () => {
    ctx.services = { ...services, telemetry: undefined }
    const incrementCounterWithTransactionAmountSpy = jest
      .spyOn(services.telemetry, 'incrementCounterWithTransactionAmount')
      .mockImplementation(() => Promise.resolve())

    const incrementCounterSpy = jest
      .spyOn(services.telemetry, 'incrementCounter')
      .mockImplementation(() => Promise.resolve())

    const prepare = IlpPrepareFactory.build()
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const rawReply = serializeIlpFulfill(IlpFulfillFactory.build())
    const ilpHandler = jest.fn().mockImplementation((ctx, next) => {
      ctx.response.rawReply = rawReply
      next()
    })
    const next = jest.fn()
    const middleware = createIlpPacketMiddleware(ilpHandler, { getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(incrementCounterWithTransactionAmountSpy).not.toHaveBeenCalled()
    expect(incrementCounterSpy).not.toHaveBeenCalled()
  })

  it('should not gather telemetry if request.prepare.amount is 0', async () => {
    const incrementCounterWithTransactionAmountSpy = jest
      .spyOn(services.telemetry, 'incrementCounterWithTransactionAmount')
      .mockImplementation(() => Promise.resolve())

    const incrementCounterSpy = jest
      .spyOn(services.telemetry, 'incrementCounter')
      .mockImplementation(() => Promise.resolve())

    const prepare = IlpPrepareFactory.build()
    prepare.amount = '0'
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const rawReply = serializeIlpReject(IlpRejectFactory.build())
    const ilpHandler = jest.fn().mockImplementation((ctx, next) => {
      ctx.response.rawReply = rawReply
      next()
    })
    const next = jest.fn()
    const middleware = createIlpPacketMiddleware(ilpHandler, { getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(incrementCounterWithTransactionAmountSpy).not.toHaveBeenCalled()
    expect(incrementCounterSpy).not.toHaveBeenCalled()
  })

  it('should gather amount and packet count telemetry if response.fulfill is defined', async () => {
    const incrementCounterWithTransactionAmountSpy = jest
      .spyOn(services.telemetry, 'incrementCounterWithTransactionAmount')
      .mockImplementation(() => Promise.resolve())

    const incrementCounterSpy = jest
      .spyOn(services.telemetry, 'incrementCounter')
      .mockImplementation(() => Promise.resolve())

    const prepare = IlpPrepareFactory.build()
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const rawReply = serializeIlpFulfill(IlpFulfillFactory.build())
    const ilpHandler = jest.fn().mockImplementation((ctx, next) => {
      ctx.response.rawReply = rawReply
      next()
    })
    const next = jest.fn()
    const middleware = createIlpPacketMiddleware(ilpHandler, { getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(incrementCounterWithTransactionAmountSpy).toHaveBeenCalledTimes(1)
    expect(incrementCounterSpy).toHaveBeenCalledTimes(2)
  })

  it('should only gather packet count telemetry if response.fulfill undefined', async () => {
    const incrementCounterWithTransactionAmountSpy = jest
      .spyOn(services.telemetry, 'incrementCounterWithTransactionAmount')
      .mockImplementation(() => Promise.resolve())

    const incrementCounterSpy = jest
      .spyOn(services.telemetry, 'incrementCounter')
      .mockImplementation(() => Promise.resolve())

    const prepare = IlpPrepareFactory.build()
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const rawReply = serializeIlpReject(IlpRejectFactory.build())
    const ilpHandler = jest.fn().mockImplementation((ctx, next) => {
      ctx.response.rawReply = rawReply
      next()
    })
    const next = jest.fn()
    const middleware = createIlpPacketMiddleware(ilpHandler, { getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(incrementCounterWithTransactionAmountSpy).not.toHaveBeenCalled()
    expect(incrementCounterSpy).toHaveBeenCalledTimes(2)
  })
})
