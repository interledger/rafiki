import Koa from 'koa'
import Router from 'koa-router'

import logger from 'koa-logger'
import json from 'koa-json'
import bodyParser from 'koa-bodyparser'

import { createSignatureHeaders } from './utils/signatures'
import { parseOrProvisionKey } from './utils/key'
import { v4 as uuid } from 'uuid'
import { RequestLike } from 'http-message-signatures'

const app = new Koa()
const router = new Router()

// Load key
const privateKey = parseOrProvisionKey(process.env.KEY_FILE)
const keyId = process.env.KEY_ID || uuid()

// Router
router.get('/', async (ctx): Promise<void> => {
  ctx.body = { msg: "I don't exist." }
})

router.post('/', async (ctx): Promise<void> => {
  const request = ctx.request.body as RequestLike
  if (!request.headers || !request.method || !request.url) {
    ctx.status = 400
    return
  }
  const headers = await createSignatureHeaders({ request, privateKey, keyId })
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
