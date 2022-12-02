import Koa from 'koa'
import Router from 'koa-router'

import logger from 'koa-logger'
import json from 'koa-json'
import bodyParser from 'koa-bodyparser'

import { parseOrProvisionKey } from './utils/key'
import { createHeaders } from './utils/headers'

const app = new Koa()
const router = new Router()

// Load key
const privateKey = parseOrProvisionKey(process.env.KEY_FILE)

// Router
router.get('/', async (ctx): Promise<void> => {
  ctx.body = { msg: "I don't exist." }
})

router.post('/', async (ctx): Promise<void> => {
  const { request, keyId } = ctx.request.body
  if (!keyId || !request.headers || !request.method || !request.url) {
    ctx.status = 400
    return
  }
  const headers = await createHeaders({ request, privateKey, keyId })
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
