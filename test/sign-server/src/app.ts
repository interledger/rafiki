import fastify from 'fastify'
import { loadBase64Key, createHeaders } from '@interledger/http-signature-utils'
import logger from './logger'

interface RequestBody {
  base64Key?: string
  keyId?: string
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
}

const validateBody = (req: RequestBody) =>
  !!req.base64Key &&
  !!req.keyId &&
  !!req.method &&
  !!req.url &&
  !!req.headers &&
  !!req.body

export function createApp(port: number) {
  const app = fastify()

  app.post('/http-sign', async function handler(ffReq, ffReply) {
    const requestBody = JSON.parse(JSON.stringify(ffReq.body))
    if (!validateBody(requestBody as RequestBody)) {
      return {
        statusCode: '400',
        body: 'Insufficient data in request body'
      }
    }

    logger.info('We are further!')

    const { base64Key, keyId, method, url, headers, body } = requestBody
    let privateKey = undefined
    try {
      privateKey = loadBase64Key(base64Key)
    } catch {
      ffReply.code(400).send({ body: { error: 'Not a valid private key' } })
      return
    }
    if (privateKey === undefined) {
      ffReply.code(400).send({ body: { error: 'Not an Ed25519 private key' } })
      return
    }

    const request = { method, headers, url, body }
    const createdHeaders = await createHeaders({
      request,
      privateKey,
      keyId
    })
    delete createdHeaders['Content-Length']
    delete createdHeaders['Content-Type']

    ffReply.code(200).send({ body: JSON.stringify(createdHeaders) })
  })

  return async () => {
    await app.listen({ port, host: '0.0.0.0' })
    logger.info(
      `🕹-> ✍️ <- 🕹 'Rafiki-Sign-Server' Listening on port '${port}'`
    )
  }
}
