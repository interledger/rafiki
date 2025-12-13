import Koa from 'koa'
import httpMocks from 'node-mocks-http'
import { AppContextData, AppServices } from '../app'
import { IocContract } from '@adonisjs/fold'

export function createContext<T extends object>(
  reqOpts: httpMocks.RequestOptions,
  params: Record<string, unknown>,
  container?: IocContract<AppServices>
): T {
  const req = httpMocks.createRequest(reqOpts)
  const res = httpMocks.createResponse()
  const koa = new Koa<unknown, AppContextData>()
  koa.keys = ['test-key']
  const ctx = koa.createContext(req, res)
  ctx.params = params
  ctx.query = reqOpts.query || {}
  ctx.container = container
  return ctx as T
}
