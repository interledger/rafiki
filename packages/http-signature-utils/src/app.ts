import Koa from 'koa'
import Router from 'koa-router'

import logger from 'koa-logger'
import json from 'koa-json'
import { koaBody as bodyParser } from 'koa-body'

import { parseOrProvisionKey } from './utils/key'
import { createHeaders, Headers } from './utils/headers'
import { RequestLike } from '.'

interface KoaRequest<TRequestBody> extends Koa.Request {
  body?: TRequestBody
}

type AppContext<
  TRequest = unknown,
  TResponseBody = unknown
> = Koa.ParameterizedContext<
  Koa.DefaultState,
  Koa.DefaultContext & {
    request: TRequest
  },
  TResponseBody
>

const app = new Koa<Koa.DefaultState, AppContext>()
const router = new Router()

// Load key
const privateKey = parseOrProvisionKey(process.env.KEY_FILE)

type GenerateSignatureRequestBody = {
  request: RequestLike
  keyId: string
}

router.post(
  '/',
  async (
    ctx: AppContext<KoaRequest<GenerateSignatureRequestBody>, Headers>
  ): Promise<void> => {
    const { request, keyId } = ctx.request.body

    if (!keyId || request.headers || request.method || request.url) {
      ctx.status = 400
      return
    }

    const headers = await createHeaders({ request, privateKey, keyId })
    delete headers['Content-Length']
    delete headers['Content-Type']

    ctx.body = headers
  }
)

// Middlewares
app.use(json())
app.use(logger())
app.use(bodyParser())

// Routes
app.use(router.routes()).use(router.allowedMethods())

app.listen(3000, () => {
  console.log('HTTP Signature Manager started.')
})
