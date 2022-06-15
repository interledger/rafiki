import EventEmitter from 'events'
import * as httpMocks from 'node-mocks-http'
import Koa from 'koa'

import { AppContext, AppContextData } from '../app'

export function createContext(
  reqOpts: httpMocks.RequestOptions,
  params: Record<string, unknown>
): AppContext {
  const req = httpMocks.createRequest(reqOpts)
  const res = httpMocks.createResponse()
  const koa = new Koa<unknown, AppContextData>()
  koa.keys = ['test-key']
  const ctx = koa.createContext(req, res)
  ctx.params = params
  ctx.session = {}
  ctx.closeEmitter = new EventEmitter()
  return ctx as AppContext
}
