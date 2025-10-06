import { createHmac } from 'crypto'
import { canonicalize } from 'json-canonicalize'
import { AppContext } from '../app'

function getSignatureParts(signature: string) {
  const signatureParts = signature.split(', ')
  const timestamp = signatureParts[0].split('=')[1]
  const signatureVersionAndDigest = signatureParts[1].split('=')
  const version = signatureVersionAndDigest[0].replace('v', '')
  const digest = signatureVersionAndDigest[1]

  return { timestamp, version, digest }
}

function verifyWebhookSignatureDigest(
  signature: string,
  request: AppContext['request'],
  configSignatureVersion: number,
  secret: string
): boolean {
  const { body } = request
  const {
    version: signatureVersion,
    digest: signatureDigest,
    timestamp
  } = getSignatureParts(signature as string)

  if (Number(signatureVersion) !== configSignatureVersion) {
    return false
  }

  const payload = `${timestamp}.${canonicalize(body)}`
  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return digest === signatureDigest
}

export async function webhookHttpSigMiddleware(
  ctx: AppContext,
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  next: () => Promise<any>
): Promise<void> {
  if (!ctx.request.headers['rafiki-signature'])
    ctx.throw(401, 'invalid webhook signature header')

  const config = await ctx.container.use('config')

  if (
    !verifyWebhookSignatureDigest(
      ctx.request.headers['rafiki-signature'] as string,
      ctx.request,
      config.webhookSignatureVersion,
      config.webhookSignatureSecret
    )
  ) {
    ctx.throw(401, 'invalid webhook signature')
  }

  return next()
}
