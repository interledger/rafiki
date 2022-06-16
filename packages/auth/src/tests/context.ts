import EventEmitter from 'events'
import * as httpMocks from 'node-mocks-http'
import Koa from 'koa'
import session from 'koa-session'

import { AppContext, AppContextData } from '../app'

export function createContext(
  reqOpts: httpMocks.RequestOptions,
  params: Record<string, unknown>
): AppContext {
  const req = httpMocks.createRequest(reqOpts)
  const res = httpMocks.createResponse()
  const koa = new Koa<unknown, AppContextData>()
  koa.keys = ['test-key']
  koa.use(
    session(
      {
        key: 'sessionId',
        maxAge: 60 * 1000,
        signed: true
      },
      // Only accepts Middleware<DefaultState, DefaultContext> for some reason, this.koa is Middleware<DefaultState, AppContext>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      koa as any
    )
  )
  const ctx = koa.createContext(req, res)
  ctx.params = params
  ctx.closeEmitter = new EventEmitter()
  return ctx as AppContext
}
