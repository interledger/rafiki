import * as crypto from 'crypto'
import { AppContext } from '../app'
import { canonicalize } from 'json-canonicalize'
import { IAppConfig } from '../config/app'

export function generateNonce(): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase()
}

export function generateToken(): string {
  return crypto.randomBytes(10).toString('hex').toUpperCase()
}

export function generateRouteLogs(ctx: AppContext): {
  route: typeof ctx.path
  method: typeof ctx.method
  params: typeof ctx.params
  headers: typeof ctx.headers
  requestBody: typeof ctx.request.body
} {
  return {
    method: ctx.method,
    route: ctx.path,
    headers: ctx.headers,
    params: ctx.params,
    requestBody: ctx.request.body
  }
}

function getSignatureParts(signature: string) {
  const signatureParts = signature?.split(', ')
  const timestamp = signatureParts[0].split('=')[1]
  const signatureVersionAndDigest = signatureParts[1].split('=')
  const signatureVersion = signatureVersionAndDigest[0].replace('v', '')
  const signatureDigest = signatureVersionAndDigest[1]

  return {
    timestamp,
    version: signatureVersion,
    digest: signatureDigest
  }
}

function verifyApiSignatureDigest(
  signature: string,
  request: AppContext['request'],
  config: IAppConfig
): boolean {
  const { body } = request
  const {
    version: signatureVersion,
    digest: signatureDigest,
    timestamp
  } = getSignatureParts(signature as string)

  if (Number(signatureVersion) !== config.adminApiSignatureVersion) {
    return false
  }

  const payload = `${timestamp}.${canonicalize(body)}`
  const hmac = crypto.createHmac('sha256', config.adminApiSecret as string)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return digest === signatureDigest
}

async function canApiSignatureBeProcessed(
  signature: string,
  ctx: AppContext,
  config: IAppConfig
): Promise<boolean> {
  const { timestamp } = getSignatureParts(signature)
  const signatureTime = Number(timestamp)
  const currentTime = Date.now()
  const ttlMilliseconds = config.adminApiSignatureTtlSeconds * 1000

  if (currentTime - signatureTime > ttlMilliseconds) return false

  const redis = await ctx.container.use('redis')
  const key = `signature:${signature}`
  if (await redis.get(key)) return false

  const op = redis.multi()
  op.set(key, signature)
  op.expire(key, ttlMilliseconds)
  await op.exec()

  return true
}

export async function verifyApiSignature(
  ctx: AppContext,
  config: IAppConfig
): Promise<boolean> {
  const { headers } = ctx.request
  const signature = headers['signature']
  if (!signature) {
    return false
  }

  if (!(await canApiSignatureBeProcessed(signature as string, ctx, config)))
    return false

  return verifyApiSignatureDigest(signature as string, ctx.request, config)
}

// Intended for Date strings like "2024-12-05T15:10:09.545Z" (e.g., from new Date().toISOString())
export function isValidDateString(date: string): boolean {
  return !isNaN(Date.parse(date))
}
