import * as crypto from 'crypto'
import { AppContext } from '../app'
import { Context } from 'koa'
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
export function verifyApiSignature(ctx: Context, config: IAppConfig): boolean {
  const { headers, body } = ctx.request
  const signature = headers['signature']
  if (!signature) {
    return false
  }

  const signatureParts = (signature as string)?.split(', ')
  const timestamp = signatureParts[0].split('=')[1]
  const signatureVersionAndDigest = signatureParts[1].split('=')
  const signatureVersion = signatureVersionAndDigest[0].replace('v', '')
  const signatureDigest = signatureVersionAndDigest[1]

  if (Number(signatureVersion) !== config.apiSignatureVersion) {
    return false
  }

  const payload = `${timestamp}.${canonicalize(body)}`
  const hmac = crypto.createHmac('sha256', config.apiSecret as string)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return digest === signatureDigest
}
