import EventEmitter from 'events'
import * as crypto from 'crypto'
import { Transaction as KnexTransaction } from 'knex'
import { v4 as uuid } from 'uuid'
import { Model } from 'objection'
import createLogger from 'pino'
import Koa, { Middleware } from 'koa'
import * as httpMocks from 'node-mocks-http'
import { StreamServer } from '@interledger/stream-receiver'
import { createSPSPHandler } from './endpoint'
import { AppContext, AppContextData } from '../app'
import { UserService, createUserService } from '../user/service'
import { AccountService, createAccountService } from '../account/service'
import { createTestApp, TestContainer } from '../tests/app'
import { initIocContainer } from '../'
import { Config } from '../config/app'

describe('SPSP handler', function () {
  const logger = createLogger()
  const nonce = crypto.randomBytes(16).toString('base64')
  const secret = crypto.randomBytes(32).toString('base64')
  const next = async function () {
    // just to satisfy the types
    throw new Error('unreachable')
  }
  let handle: Middleware<unknown, AppContext>

  const streamServer = new StreamServer({
    serverSecret: Config.streamSecret,
    serverAddress: Config.ilpAddress
  })

  let appContainer: TestContainer
  let userId: string
  let accountId: string
  let accountService: AccountService
  let userService: UserService
  let trx: KnexTransaction

  beforeAll(async () => {
    const deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  beforeEach(async () => {
    trx = await appContainer.knex.transaction()
    Model.knex(trx)
    userService = await createUserService({ logger, knex: trx })
    accountService = await createAccountService({ logger, knex: trx })
    const user = await userService.create()
    userId = user.id
    accountId = user.accountId
    handle = await createSPSPHandler({
      accountService,
      userService,
      config: Config
    })
  })

  afterEach(async () => {
    await trx.rollback()
    await trx.destroy()
  })

  afterAll(async () => {
    await appContainer.shutdown()
  })

  test('invalid account id; returns 400', async () => {
    const ctx = createContext({})
    ctx.params.id = 'not_a_uuid'
    await expect(handle(ctx, next)).rejects.toHaveProperty('status', 400)
  })

  test('wrong Accept; returns 406', async () => {
    const ctx = createContext({
      headers: { Accept: 'application/json' }
    })
    await expect(handle(ctx, next)).rejects.toHaveProperty('status', 406)
  })

  test('nonce, no secret; returns 400', async () => {
    const ctx = createContext({
      headers: { 'Receipt-Nonce': nonce }
    })
    await expect(handle(ctx, next)).rejects.toHaveProperty('status', 400)
  })

  test('secret; no nonce; returns 400', async () => {
    const ctx = createContext({
      headers: { 'Receipt-Secret': secret }
    })
    await expect(handle(ctx, next)).rejects.toHaveProperty('status', 400)
  })

  test('malformed nonce; returns 400', async () => {
    const ctx = createContext({
      headers: {
        'Receipt-Nonce': Buffer.alloc(15).toString('base64'),
        'Receipt-Secret': secret
      }
    })
    await expect(handle(ctx, next)).rejects.toHaveProperty('status', 400)
  })

  test('no account; returns 404', async () => {
    const ctx = createContext({})
    ctx.params.id = uuid()
    await expect(handle(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.status).toBe(404)
    expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')
    expect(JSON.parse(ctx.body as string)).toEqual({
      id: 'InvalidReceiverError',
      message: 'Invalid receiver ID'
    })
  })

  /*
  test('disabled account; returns 404', async () => {
    const ctx = createContext({})
    await expect(handle(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.status).toBe(404)
    expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')
    expect(JSON.parse(ctx.body as string)).toEqual({
      id: 'InvalidReceiverError',
      message: 'Invalid receiver ID'
    })
  })

  test('disabled stream; returns 400', async () => {
    const ctx = createContext({})
    await expect(handle(ctx, next)).rejects.toHaveProperty('status', 400)
  })
*/

  test('receipts disabled', async () => {
    const ctx = createContext({})
    await expect(handle(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')

    const res = JSON.parse(ctx.body as string)
    expect(res.destination_account).toEqual(
      expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/)
    )
    expect(Buffer.from(res.shared_secret, 'base64')).toHaveLength(32)
    expect(res.receipts_enabled).toBe(false)
    expect(decryptConnectionDetails(res.destination_account)).toEqual({
      paymentTag: accountId,
      asset: {
        code: 'USD',
        scale: 6
      }
    })
  })

  test('receipts enabled', async () => {
    const ctx = createContext({
      headers: {
        'Receipt-Nonce': nonce,
        'Receipt-Secret': secret
      }
    })
    await expect(handle(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')

    const res = JSON.parse(ctx.body as string)
    expect(ctx.status).toBe(200)
    expect(res.destination_account).toEqual(
      expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{159}$/)
    )
    expect(Buffer.from(res.shared_secret, 'base64')).toHaveLength(32)
    expect(res.receipts_enabled).toBe(true)
    expect(decryptConnectionDetails(res.destination_account)).toEqual({
      paymentTag: accountId,
      asset: {
        code: 'USD',
        scale: 6
      },
      receiptSetup: {
        nonce: Buffer.from(nonce, 'base64'),
        secret: Buffer.from(secret, 'base64')
      }
    })
  })

  function createContext(reqOpts: httpMocks.RequestOptions): AppContext {
    reqOpts.headers = Object.assign(
      { accept: 'application/spsp4+json' },
      reqOpts.headers
    )
    const req = httpMocks.createRequest(reqOpts)
    const res = httpMocks.createResponse()
    const koa = new Koa<unknown, AppContextData>()
    const ctx = koa.createContext(req, res)
    ctx.params = { id: userId }
    ctx.logger = logger
    ctx.closeEmitter = new EventEmitter()
    return ctx as AppContext
  }

  function decryptConnectionDetails(destination: string): unknown {
    const token = streamServer['extractLocalAddressSegment'](destination)
    return streamServer['decryptToken'](Buffer.from(token, 'base64'))
  }
})
