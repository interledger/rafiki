import EventEmitter from 'events'
import * as httpMocks from 'node-mocks-http'
import Koa from 'koa'
import session from 'koa-session'

import { AppContext, AppContextData } from '../app'
import { generateSigHeaders } from './signature'

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
      // Only accepts Middleware<DefaultState, DefaultContext> for some reason, koa is Middleware<DefaultState, AppContext>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      koa as any
    )
  )
  const ctx = koa.createContext(req, res)
  ctx.params = params
  ctx.session = { ...req.session }
  ctx.closeEmitter = new EventEmitter()
  return ctx as AppContext
}

export async function createContextWithSigHeaders(
  reqOpts: httpMocks.RequestOptions,
  params: Record<string, unknown>,
  requestBody: Record<string, unknown>
): Promise<AppContext> {
  const { headers, url, method } = reqOpts
  const { signature, sigInput, contentDigest } = await generateSigHeaders(
    url as string,
    method as string,
    requestBody
  )

  const ctx = createContext(
    {
      ...reqOpts,
      headers: {
        ...headers,
        'Content-Digest': contentDigest,
        Signature: signature,
        'Signature-Input': sigInput
      }
    },
    params
  )

  ctx.request.body = requestBody

  return ctx as AppContext
}
