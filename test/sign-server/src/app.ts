import fastify from 'fastify'
import {
  createHeaders,
  loadBase64Key,
  validateSignatureHeaders,
  validateSignature
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

interface RequestConsent {
  startInteractionUrl?: string
  interactionFinish?: string
  interactionServer?: string
  idpSecret?: string
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
  !!req.method && !!req.url && !!req.headers && !!req.body

const validateBodyConsent = (req: RequestConsent) =>
  !!req.startInteractionUrl &&
  !!req.interactionFinish &&
  !!req.interactionServer &&
  !!req.idpSecret

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

    const manualHash = crypto.createHash('sha512').update(body).digest('base64')
    //TODO console.info('manualHash when signing: ' + manualHash)
    const manualHashDirectBody = crypto
      .createHash('sha512')
      .update(body)
      .digest('base64')
    /*TODO console.info(
      'manualHash when signing (direct body): ' + manualHashDirectBody
    )*/
    const manualHashStringify = crypto
      .createHash('sha512')
      .update(JSON.stringify(JSON.parse(body)))
      .digest('base64')
    //TODO console.info('manualHash when signing (stringify): ' + manualHashStringify)

    const bodyFormatted = JSON.stringify(body)
    const manualHashBodyFormatted = crypto
      .createHash('sha512')
      .update(bodyFormatted)
      .digest('base64')
    /* TODO console.info(
      'manualHash when signing (bodyFormatted): ' + manualHashBodyFormatted
    )*/

    const request = { method, headers, url, body: bodyFormatted }
    const createdHeaders = await createHeaders({
      request,
      privateKey,
      keyId
    })
    delete createdHeaders['Content-Length']
    delete createdHeaders['Content-Type']

    //TODO console.info('from the OpenPayments: ' + createdHeaders['Content-Digest'])

    ffReply.code(200).send({
      contentDigest: createdHeaders['Content-Digest'],
      signature: createdHeaders['Signature'],
      signatureInput: createdHeaders['Signature-Input'].replace(/\\"/g, '"'),
      body: JSON.stringify(createdHeaders)
    })
  })

  app.post('/http-signature-verify', async function handler(ffReq, ffReply) {
    const requestBody = JSON.parse(JSON.stringify(ffReq.body))
    if (
      !validateBodyVerifySignature(requestBody as RequestBodySignatureVerify)
    ) {
      return {
        statusCode: '400',
        body: 'Insufficient data in request body'
      }
    }
    const { keyId, base64Key, method, url, headers, body } = requestBody
    if (!headers['signature'] && ffReq.headers['signature']) {
      headers['signature'] = ffReq.headers['signature']
    }
    if (!headers['signature-input'] && ffReq.headers['signature-input']) {
      headers['signature-input'] = ffReq.headers['signature-input']
    }
    if (!headers['content-digest'] && ffReq.headers['content-digest']) {
      headers['content-digest'] = ffReq.headers['content-digest']
    }
    if (!headers['content-length'] && ffReq.headers['content-length']) {
      headers['content-length'] = ffReq.headers['content-length']
    }
    if (!headers['content-type'] && ffReq.headers['content-type']) {
      headers['content-type'] = ffReq.headers['content-type']
    }

    if (!headers['signature'] || !headers['signature-input']) {
      return {
        statusCode: '400',
        body: '[signature-input] and/or [signature] headers are missing'
      }
    }

    const manualHash = crypto.createHash('sha512').update(body).digest('base64')
    console.info('manualHash when verifying: ' + manualHash)
    console.info('vs                       : ' + headers['content-digest'])

    const bodyFormatted = JSON.stringify(JSON.parse(body))
    const request = { method, headers, url, body: bodyFormatted }
    const sigHeadersVerified = validateSignatureHeaders(request)
    const sigVerified = sigHeadersVerified
      ? await validateSignature(
          {
            kid: keyId,
            alg: 'EdDSA',
            kty: 'OKP',
            crv: 'Ed25519',
            x: base64Key
          },
          request
        )
      : false

    ffReply.code(200).send({
      signatureHeadersValid: sigHeadersVerified,
      signatureValid: sigVerified
    })
  })

  app.post('/consent-interaction', async function handler(ffReq, ffReply) {
    const requestBody = JSON.parse(JSON.stringify(ffReq.body))
    if (!validateBodyConsent(requestBody as RequestConsent)) {
      return {
        statusCode: '400',
        body: 'Insufficient data in request body'
      }
    }

    const {
      startInteractionUrl,
      interactionFinish,
      interactionServer,
      idpSecret
    } = requestBody

    // Start interaction
    const interactResponse = await fetch(startInteractionUrl, {
      redirect: 'manual' // dont follow redirects
    })
    if (interactResponse.status !== 302) {
      return {
        statusCode: '400',
        body: `Status '${interactResponse.status}' invalid for '${startInteractionUrl}'`
      }
    }
    const cookie = parseCookies(interactResponse)

    const nonce = interactionFinish
    const tokens = startInteractionUrl.split('/interact/')
    const interactId = tokens[1] ? tokens[1].split('/')[0] : null

    // Accept
    const acceptUrl = `${interactionServer}/grant/${interactId}/${nonce}/accept`
    const acceptResponse = await fetch(acceptUrl, {
      method: 'POST',
      headers: {
        'x-idp-secret': idpSecret,
        cookie
      }
    })

    if (acceptResponse.status !== 202) {
      return {
        statusCode: '400',
        body: `Accept Status '${acceptResponse.status}' invalid for '${startInteractionUrl}'`
      }
    }

    ffReply.code(200).send({
      nonce,
      interactId,
      cookie
    })
  })

  function parseCookies(response: Response) {
    return response.headers
      .getSetCookie()
      .map((header) => {
        const parts = header.split(';')
        return parts[0]
      })
      .join(';')
  }

  return async () => {
    await app.listen({ port, host: '0.0.0.0' })
    logger.info(`🕹->✍️<-🕹 'Rafiki-Sign-Server' Listening on port '${port}'`)
  }
}
