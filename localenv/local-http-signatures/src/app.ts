import Koa from 'koa'
import Router from 'koa-router'

import logger from 'koa-logger'
import json from 'koa-json'
import bodyParser from 'koa-bodyparser'

import {
  loadBase64Key,
  parseOrProvisionKey,
  createHeaders,
  Headers,
  RequestLike
} from '@interledger/http-signature-utils'

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
  base64Key?: string
}

router.post('/', async (ctx: AppContext<Headers>): Promise<void> => {
  const validateBody = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const { base64Key, keyId, request } = ctx.request.body
  const userKey = base64Key ? loadBase64Key(base64Key) : undefined

  const headers = await createHeaders({
    request,
    privateKey: userKey || privateKey,
    keyId
  })
  delete headers['Content-Length']
  delete headers['Content-Type']

  ctx.body = headers
})

// Middlewares
app.use(json())
app.use(logger())
app.use(bodyParser())

// Routes
app.use(router.routes()).use(router.allowedMethods())

app.listen(3000, () => {
  console.log('HTTP Signature Manager started.')
})
