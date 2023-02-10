import crypto from 'crypto'
import EventEmitter from 'events'
import * as httpMocks from 'node-mocks-http'
import Koa from 'koa'
import session from 'koa-session'
import { IocContract } from '@adonisjs/fold'
import { createHeaders } from 'http-signature-utils'

import { AppContext, AppContextData, AppServices } from '../app'
import { TokenHttpSigContext } from '../accessToken/routes'
import { AccessToken } from '../accessToken/model'
import { Grant } from '../grant/model'

export function createContext<T extends AppContext>(
  reqOpts: httpMocks.RequestOptions,
  params: Record<string, unknown>,
  container?: IocContract<AppServices>
): T {
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
  ctx.query = reqOpts.query || {}
  ctx.session = { ...req.session }
  ctx.closeEmitter = new EventEmitter()
  ctx.container = container
  return ctx as T
}

export async function createContextWithSigHeaders<T extends AppContext>(
  reqOpts: httpMocks.RequestOptions,
  params: Record<string, unknown>,
  requestBody: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  keyId: string,
  container?: IocContract<AppServices>
): Promise<T> {
  const { headers, url, method } = reqOpts
  if (!headers || !url || !method) {
    throw new Error('ReqestOptions missing headers or method or url')
  }
  const request = {
    url,
    method,
    headers,
    body: JSON.stringify(requestBody)
  }
  const sigHeaders = await createHeaders({
    request,
    privateKey,
    keyId
  })

  const ctx = createContext(
    {
      ...reqOpts,
      headers: {
        ...headers,
        ...sigHeaders
      }
    },
    params,
    container
  )

  ctx.request.body = requestBody

  return ctx as T
}

export function createTokenHttpSigContext(
  accessToken: AccessToken,
  grant: Grant,
  container?: IocContract<AppServices>
): TokenHttpSigContext {
  const ctx = createContext<TokenHttpSigContext>(
    {
      headers: {
        Accept: 'application/json',
        Authorization: `GNAP ${accessToken.value}`
      },
      url: `/token/${accessToken.id}`,
      method: 'POST'
    },
    { id: accessToken.managementId },
    container
  )

  accessToken.grant = grant
  ctx.accessToken = accessToken as AccessToken & { grant: Grant }

  return ctx
}
