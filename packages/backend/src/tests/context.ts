import EventEmitter from 'events'
import * as httpMocks from 'node-mocks-http'
import Koa from 'koa'
import { AppContext, AppContextData } from '../app'

export function createContext<T extends AppContext>(
  reqOpts: httpMocks.RequestOptions,
  params: Record<string, unknown>
): T {
  const req = httpMocks.createRequest(reqOpts)
  const res = httpMocks.createResponse(req)
  const koa = new Koa<unknown, AppContextData>()
  const ctx = koa.createContext(req, res)
  ctx.params = params
  ctx.closeEmitter = new EventEmitter()
  return ctx as T
}
