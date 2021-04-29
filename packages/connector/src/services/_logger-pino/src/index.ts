import { SerializedRequest, SerializedResponse, DestinationStream } from 'pino'
import { Options } from 'pino-http'
import {
  wrapRequestSerializer,
  wrapResponseSerializer
} from 'pino-std-serializers'
import logger from 'koa-pino-logger'
import { IncomingMessage, ServerResponse } from 'http'
import {
  RafikiRequestMixin,
  RafikiResponseMixin,
  RafikiContext,
  RafikiMiddleware
} from '@interledger/rafiki-core'
import { Middleware } from 'koa'

function serializeIlpPrepare(req: SerializedIlpRequest): SerializedIlpRequest {
  if (req.raw && req.raw.prepare) {
    req['ilp-destination'] = req.raw.prepare.destination
    req['ilp-amount'] = req.raw.prepare.amount
    req[
      'ilp-execution-condition'
    ] = req.raw.prepare.executionCondition.toString('hex')
    req['ilp-expires-at'] = req.raw.prepare.expiresAt
  }
  return req
}

function serializeIlpReply(res: SerializedIlpResponse): SerializedIlpResponse {
  if (res.raw && res.raw.fulfill) {
    res['ilp-fulfillment'] = res.raw.fulfill.fulfillment.toString('hex')
  }
  if (res.raw && res.raw.reject) {
    res['ilp-reject-code'] = res.raw.reject.code
    res['ilp-reject-message'] = res.raw.reject.message
    res['ilp-reject-triggered-by'] = res.raw.reject.triggeredBy
  }
  return res
}

export const serializers = {
  req: wrapRequestSerializer(serializeIlpPrepare),
  res: wrapResponseSerializer(serializeIlpReply)
}

export function createPinoMiddleware(
  options?: Options,
  stream?: DestinationStream
): RafikiMiddleware {
  const pino = logger(options, stream)
  return async function pinoLogger(
    ctx: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<Middleware> {
    return pino(ctx, async () => {
      // Attach the pino logger to services
      ctx.services.logger = ctx.log
      await next()
    })
  }
}

export interface SerializedIlpRequest extends SerializedRequest {
  raw: IncomingMessage & RafikiRequestMixin
}
export interface SerializedIlpResponse extends SerializedResponse {
  raw: ServerResponse & RafikiResponseMixin
}
