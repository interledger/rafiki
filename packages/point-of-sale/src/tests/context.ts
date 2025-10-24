import { IocContract } from '@adonisjs/fold'
import * as httpMocks from 'node-mocks-http'
import Koa from 'koa'
import { AppContext, AppContextData, AppRequest } from '../app'

export function createContext<T extends AppContext>(
  reqOpts: httpMocks.RequestOptions,
  params: Record<string, string> = {},
  container?: IocContract
): T {
  const req = httpMocks.createRequest(reqOpts)
  const res = httpMocks.createResponse({ req })
  const koa = new Koa<unknown, AppContextData>()
  const ctx = koa.createContext(req, res)
  ctx.params = (ctx.request as AppRequest).params = params
  if (reqOpts.query) {
    ctx.request.query = reqOpts.query
  }
  if (reqOpts.body !== undefined) {
    ctx.request.body = reqOpts.body
  }
  ctx.container = container
  return ctx as T
}
