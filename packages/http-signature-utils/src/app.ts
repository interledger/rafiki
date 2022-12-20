import Koa from 'koa'
import Router from 'koa-router'

import logger from 'koa-logger'
import json from 'koa-json'
import bodyParser from 'koa-bodyparser'

import { parseOrProvisionKey } from './utils/key'
import { createHeaders, Headers } from './utils/headers'
import { RequestLike } from '.'

type AppContext<TResponseBody = unknown> = Koa.ParameterizedContext<
  Koa.DefaultState,
  Koa.DefaultContext,
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

router.post('/', async (ctx: AppContext<Headers>): Promise<void> => {
  const validateBody = (
    requestBody: any
  ): requestBody is GenerateSignatureRequestBody =>
    !!requestBody.keyId &&
    !!requestBody.request.headers &&
    !!requestBody.request.method &&
    !!requestBody.request.url

  if (!validateBody(ctx.request.body)) {
    ctx.status = 400
    return
  }

  const { keyId, request } = ctx.request.body

  const headers = await createHeaders({ request, privateKey, keyId })
  delete headers['Content-Length']
  delete headers['Content-Type']

  ctx.body = headers
})

// Middlewares
app.use(logger())
app.use(json())
app.use(bodyParser())

// Routes
app.use(router.routes()).use(router.allowedMethods())

app.listen(3000, () => {
  console.log('HTTP Signature Manager started.')
})
