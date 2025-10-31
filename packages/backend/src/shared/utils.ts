import { validate, version } from 'uuid'
import { URL, type URL as URLType } from 'url'
import { createHmac } from 'crypto'
import { canonicalize } from 'json-canonicalize'
import { IAppConfig } from '../config/app'
import { AppContext } from '../app'
import { Tenant } from '../tenants/model'

export function validateId(id: string): boolean {
  return validate(id) && version(id) === 4
}

export function isValidHttpUrl(receivedUrl: string): boolean {
  let url: URLType | undefined

  try {
    url = new URL(receivedUrl.trim())
  } catch (e) {
    return false
  }

  // Verify protocol
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false
  }

  // Verify hostname
  if (url.hostname === '') return false

  // Check for empty domains or subdomains
  const parts = url.hostname.split('.')
  if (parts.indexOf('') !== -1) return false

  return true
}

export async function requestWithTimeout<T>(
  request: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutId
  const timeout = async (): Promise<never> =>
    new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Request timed out')),
        timeoutMs
      )
    })

  const response = await Promise.race([request(), timeout()])
  clearTimeout(timeoutId)
  return response
}

interface PollArgs<T> {
  request(): Promise<T>
  stopWhen?(result: T): boolean
  pollingFrequencyMs: number
  timeoutMs: number
}

export async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function poll<T>(args: PollArgs<T>): Promise<T> {
  const {
    request,
    stopWhen = (response: T) => !!response,
    timeoutMs,
    pollingFrequencyMs
  } = args

  let elapsedTimeMs = 0
  let response: T

  do {
    const requestStart = Date.now()

    response = await requestWithTimeout(
      () => request(),
      timeoutMs - elapsedTimeMs
    )

    if (stopWhen(response)) {
      return response
    }

    elapsedTimeMs += Date.now() - requestStart + pollingFrequencyMs

    if (elapsedTimeMs >= timeoutMs) {
      throw new Error('Request timed out')
    }

    await sleep(pollingFrequencyMs)
    // eslint-disable-next-line no-constant-condition
  } while (true)
}

/**
 * Omit distributed to all types in a union.
 * @example
 * type WithoutA = UnionOmit<{ a: number; c: number } | { b: number }, 'a'> // { c: number } | { b: number }
 * const withoutAOK: WithoutA = { c: 1 } // OK
 * const withoutAOK2: WithoutA = { b: 1 } // OK
 * const withoutAError: WithoutA = { a: 1, c: 1 } // Error
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UnionOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never

function getSignatureParts(signature: string) {
  const signatureParts = signature.split(', ')
  const timestamp = signatureParts[0].split('=')[1]
  const signatureVersionAndDigest = signatureParts[1].split('=')
  const version = signatureVersionAndDigest[0].replace('v', '')
  const digest = signatureVersionAndDigest[1]

  return { timestamp, version, digest }
}

function verifyApiSignatureDigest(
  ctx: AppContext,
  signature: string,
  request: AppContext['request'],
  adminApiSignatureVersion: number,
  secret: string
): boolean {
  const { body } = request
  const {
    version: signatureVersion,
    digest: signatureDigest,
    timestamp
  } = getSignatureParts(signature as string)

  if (Number(signatureVersion) !== adminApiSignatureVersion) {
    ctx.logger.debug('Tenant sig verification: signature version mismatch')
    return false
  }

  const payload = `${timestamp}.${canonicalize(body)}`

  ctx.logger.debug(
    { body, payload, signature, scrt: secret },
    'Tenant sig verification: ready for digest verification'
  )

  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  const isValid = digest === signatureDigest

  if (!isValid) {
    ctx.logger.debug('Tenant sig verification: digest mismatch')
  }

  return isValid
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

  if (currentTime - signatureTime > ttlMilliseconds) {
    ctx.logger.debug('Tenant sig verification: request too old')
    return false
  }

  const redis = await ctx.container.use('redis')
  const key = `signature:${signature}`
  if (await redis.get(key)) {
    ctx.logger.debug('Tenant sig verification: received duplicate signature')
    return false
  }

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

/*
  Verifies http signatures by first attempting to replicate it with a secret
  associated with a tenant id in the headers.

  If a tenant secret can replicate the signature, the request is tenanted to that particular tenant.
  If the environment admin secret matches the tenant's secret, then it is an operator request with elevated permissions.
  If neither can replicate the signature then it is unauthorized.
*/
export async function getTenantFromApiSignature(
  ctx: AppContext,
  config: IAppConfig
): Promise<TenantApiSignatureResult | undefined> {
  const { headers } = ctx.request
  const signature = headers['signature']
  if (!signature) {
    return undefined
  }

  const tenantService = await ctx.container.use('tenantService')
  const tenantId = headers['tenant-id'] as string
  const tenant = tenantId ? await tenantService.get(tenantId) : undefined

  if (!tenant) {
    ctx.logger.debug('Tenant sig verification: tenant not found')
    return undefined
  }

  ctx.logger.debug({ tenant }, 'Tenant sig verification: found tenant')

  if (!(await canApiSignatureBeProcessed(signature as string, ctx, config)))
    return undefined

  if (
    tenant.apiSecret &&
    verifyApiSignatureDigest(
      ctx,
      signature as string,
      ctx.request,
      config.adminApiSignatureVersion,
      tenant.apiSecret
    )
  ) {
    return { tenant, isOperator: tenant.apiSecret === config.adminApiSecret }
  }

  return undefined
}

export function ensureTrailingSlash(str: string): string {
  if (!str.endsWith('/')) return `${str}/`
  return str
}
