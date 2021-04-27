import { Readable } from 'stream'
import {
  serializeIlpPrepare,
  serializeIlpFulfill,
  deserializeIlpFulfill,
  serializeIlpReject,
  deserializeIlpReject
} from 'ilp-packet'
import { createContext, MockIncomingMessageOptions } from '../../../utils'
import { createIlpPacketMiddleware } from '../../middleware/ilp-packet'
import {
  IlpPrepareFactory,
  IlpFulfillFactory,
  IlpRejectFactory
} from '../../factories'
import { RafikiContext } from '../../rafiki'

describe('ILP Packet Middleware', () => {
  test('attaches the ilp prepare to the req object', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.rawReply = serializeIlpFulfill(IlpFulfillFactory.build())
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(Object.keys(ctx.req)).toContain('prepare')
    expect(Object.keys(ctx.req)).toContain('rawPrepare')
    expect(Object.keys(ctx.request)).toContain('prepare')
    expect(Object.keys(ctx.request)).toContain('rawPrepare')
  })

  test('sets the path to be the ilpAddress converted into a url path', async () => {
    const prepare = IlpPrepareFactory.build({
      destination: 'test.rafiki.alice'
    })
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.rawReply = serializeIlpFulfill(IlpFulfillFactory.build())
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.path).toEqual('test/rafiki/alice')
  })

  test('setting the fulfill sets the rawFulfill and clears the reject and rawReject', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reject = IlpRejectFactory.build()
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reject).toBeDefined()
    expect(ctx.response.rawReject).toBeDefined()

    ctx.response.fulfill = IlpFulfillFactory.build()

    expect(ctx.response.reject).toBeUndefined()
    expect(ctx.response.rawReject).toBeUndefined()
    expect(serializeIlpFulfill(ctx.response.fulfill)).toEqual(
      ctx.response.rawFulfill
    )
  })

  test('setting the rawFulfill sets the fulfill and clears the reject and rawReject', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reject = IlpRejectFactory.build()
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reject).toBeDefined()
    expect(ctx.response.rawReject).toBeDefined()

    ctx.response.rawFulfill = serializeIlpFulfill(IlpFulfillFactory.build())

    expect(ctx.response.reject).toBeUndefined()
    expect(ctx.response.rawReject).toBeUndefined()
    expect(deserializeIlpFulfill(ctx.response.rawFulfill)).toEqual(
      ctx.response.fulfill
    )
  })

  test('setting the reject sets the rawReject and clears the fulfill and rawFulfill', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.fulfill = IlpFulfillFactory.build()
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.fulfill).toBeDefined()
    expect(ctx.response.rawFulfill).toBeDefined()

    ctx.response.reject = IlpRejectFactory.build()

    expect(ctx.response.fulfill).toBeUndefined()
    expect(ctx.response.rawFulfill).toBeUndefined()
    expect(serializeIlpReject(ctx.response.reject)).toEqual(
      ctx.response.rawReject
    )
  })

  test('setting the rawReject sets the reject and clears the fulfill and rawFulfill', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.fulfill = IlpFulfillFactory.build()
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.fulfill).toBeDefined()
    expect(ctx.response.rawFulfill).toBeDefined()

    ctx.response.rawReject = serializeIlpReject(IlpRejectFactory.build())

    expect(ctx.response.fulfill).toBeUndefined()
    expect(ctx.response.rawFulfill).toBeUndefined()
    expect(deserializeIlpReject(ctx.response.rawReject)).toEqual(
      ctx.response.reject
    )
  })

  test('setting the reply as undefined clears the fulfill', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reply = IlpFulfillFactory.build()
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.fulfill).toBeDefined()
    expect(ctx.response.rawFulfill).toBeDefined()

    ctx.response.reply = undefined

    expect(ctx.response.fulfill).toBeUndefined()
    expect(ctx.response.rawFulfill).toBeUndefined()
  })

  test('setting the reply as undefined clears the reject', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reply = IlpRejectFactory.build()
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reject).toBeDefined()
    expect(ctx.response.rawReject).toBeDefined()

    ctx.response.reply = undefined

    expect(ctx.response.reject).toBeUndefined()
    expect(ctx.response.rawReject).toBeUndefined()
  })

  test('setting the reply as a fulfill sets the fulfill and rawFulfill', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const fulfill = IlpFulfillFactory.build()
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reply = fulfill
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.fulfill).toEqual(fulfill)
    expect(ctx.response.rawFulfill).toEqual(serializeIlpFulfill(fulfill))
  })

  test('setting the reply as a reject sets the reject and rawReject', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const reject = IlpRejectFactory.build()
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reply = reject // set the fulfill after the getters and setters have been attached
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toEqual(reject)
    expect(ctx.response.rawReject).toEqual(serializeIlpReject(reject))
  })

  test('setting the rawReply as rawFulfill sets the fulfill and rawFulfill', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const rawFulfill = serializeIlpFulfill(IlpFulfillFactory.build())
    const next = jest.fn().mockImplementation(() => {
      ctx.response.rawReply = rawFulfill // set the fulfill after the getters and setters have been attached
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.fulfill).toEqual(deserializeIlpFulfill(rawFulfill))
    expect(ctx.response.rawFulfill).toEqual(rawFulfill)
  })

  test('setting the rawReply as rawReject sets the reject and rawReject', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const rawReject = serializeIlpReject(IlpRejectFactory.build())
    const next = jest.fn().mockImplementation(() => {
      ctx.response.rawReply = rawReject
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toEqual(deserializeIlpReject(rawReject))
    expect(ctx.response.rawReject).toEqual(rawReject)
  })

  test('setting the rawReply as undefined clears the reject and rawReject', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.rawReject = serializeIlpReject(IlpRejectFactory.build())
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reject).toBeDefined()
    expect(ctx.response.rawReject).toBeDefined()

    ctx.response.rawReply = undefined

    expect(ctx.response.reject).toBeUndefined()
    expect(ctx.response.rawReject).toBeUndefined()
  })

  test('setting the rawReply as undefined clears the fulfill and rawFulfill', async () => {
    const prepare = IlpPrepareFactory.build()
    const options: MockIncomingMessageOptions = {
      headers: { 'content-type': 'application/octet-stream' }
    }
    const ctx = createContext<unknown, RafikiContext>({ req: options })
    const getRawBody = async (_req: Readable) => serializeIlpPrepare(prepare)
    const next = jest.fn().mockImplementation(() => {
      ctx.response.rawFulfill = serializeIlpFulfill(IlpFulfillFactory.build())
    })
    const middleware = createIlpPacketMiddleware({ getRawBody })
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.fulfill).toBeDefined()
    expect(ctx.response.rawFulfill).toBeDefined()

    ctx.response.rawReply = undefined

    expect(ctx.response.fulfill).toBeUndefined()
    expect(ctx.response.rawFulfill).toBeUndefined()
  })
})
