import { canonicalize } from 'json-canonicalize'
import { AppContext } from '../app'
import { IAppConfig } from '../config/app'
import { Tenant } from '../tenant/model'
import * as crypto from 'crypto'

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

interface VerifyApiSignatureArgs {
  signature: string
  request: AppContext['request']
  tenantApiSecret: string
  apiSignatureVersion: number
}

function verifyApiSignatureDigest(args: VerifyApiSignatureArgs): boolean {
  const { signature, request, tenantApiSecret, apiSignatureVersion } = args
  const { body } = request
  const {
    version: signatureVersion,
    digest: signatureDigest,
    timestamp
  } = getSignatureParts(signature)

  if (Number(signatureVersion) !== apiSignatureVersion) {
    return false
  }

  const payload = `${timestamp}.${canonicalize(body)}`
  const hmac = crypto.createHmac('sha256', tenantApiSecret)
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

export interface TenantApiSignatureResult {
  tenant: Tenant
  isOperator: boolean
}

export async function getTenantFromApiSignature(
  ctx: AppContext,
  config: IAppConfig
): Promise<TenantApiSignatureResult | undefined> {
  const { headers } = ctx.request
  const signature = headers['signature'] as string | undefined
  if (!signature) {
    return
  }

  const tenantService = await ctx.container.use('tenantService')
  const tenantId = headers['tenant-id'] as string | undefined
  const tenant = tenantId ? await tenantService.get(tenantId) : undefined

  if (!tenant) return

  if (!(await canApiSignatureBeProcessed(signature, ctx, config))) return

  if (
    tenant.apiSecret &&
    verifyApiSignatureDigest({
      signature,
      request: ctx.request,
      tenantApiSecret: tenant.apiSecret,
      apiSignatureVersion: config.adminApiSignatureVersion
    })
  ) {
    return { tenant, isOperator: tenant.apiSecret === config.adminApiSecret }
  }
}
