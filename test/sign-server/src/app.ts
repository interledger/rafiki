import fastify from 'fastify'
import {
  loadBase64Key,
  createHeaders,
  RequestLike,
  validateSignatureHeaders
} from '@interledger/http-signature-utils'
import logger from './logger'
import crypto from 'crypto'

interface RequestBodySignatureVerify {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
}

interface RequestBody extends RequestBodySignatureVerify {
  base64Key?: string
  keyId?: string
}

const KEY_CACHE = new Map<string, crypto.KeyObject>()

const validateBody = (req: RequestBody) =>
  !!req.base64Key &&
  !!req.keyId &&
  !!req.method &&
  !!req.url &&
  !!req.headers &&
  !!req.body

const validateBodyVerifySignature = (req: RequestBodySignatureVerify) =>
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

    const { base64Key, keyId, method, url, headers, body } = requestBody
    let privateKey = KEY_CACHE.get(keyId)
    try {
      if (!privateKey) {
        privateKey = loadBase64Key(base64Key)
        if (privateKey) KEY_CACHE.set(keyId, privateKey)
      }
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

    ffReply.code(200).send({
      contentDigest: createdHeaders['Content-Digest'],
      signature: createdHeaders['Signature'],
      signatureInput: createdHeaders['Signature-Input'].replace(/\\"/g, '"'),
      body: JSON.stringify(createdHeaders)
    })
  })

  app.post('/http-signature-verify', async function handler(ffReq, ffReply) {
    const requestBody = JSON.parse(JSON.stringify(ffReq.body))
    if (!validateBodyVerifySignature(requestBody as RequestBodySignatureVerify)) {
      return {
        statusCode: '400',
        body: 'Insufficient data in request body'
      }
    }
    const { method, url, headers, body } = requestBody

    if (!headers['signature'] || !headers['signature-input']) {
      return {
        statusCode: '400',
        body: '[signature-input] and/or [signature] headers are missing'
      }
    }

    if (!validateSignatureHeaders({
      method,
      url,
      headers,
      body
    })) {
      return {
        statusCode: '401',
        body: 'Signature verification failed'
      }
    }

    ffReply.code(200).send({
      signatureVerified: true
    })
  })

  app.post('/consent-interaction', async function handler(ffReq, ffReply) {
    ffReply.code(200).send({
      signatureVerified: true
    })
  })

  return async () => {
    await app.listen({ port, host: '0.0.0.0' })
    logger.info(`🕹->✍️<-🕹 'Rafiki-Sign-Server' Listening on port '${port}'`)
  }
}
