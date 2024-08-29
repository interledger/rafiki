import { validate, version } from 'uuid'
import { URL, type URL as URLType } from 'url'
import { createHmac } from 'crypto'
import { canonicalize } from 'json-canonicalize'
import axios from 'axios'
import { IAppConfig } from '../config/app'
import { AppContext, TenantedAppContext } from '../app'

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
 * Omit distrubuted to all types in a union.
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
  const hmac = createHmac('sha256', config.adminApiSecret as string)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return digest === signatureDigest
}

export function generateApiSignature(
  secret: string,
  version: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
): string {
  const timestamp = Math.round(new Date().getTime() / 1000)
  const payload = `${timestamp}.${canonicalize(body)}`
  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return `t=${timestamp}, v${version}=${digest}`
}

async function canApiSignatureBeProcessed(
  signature: string,
  ctx: AppContext,
  config: IAppConfig
): Promise<boolean> {
  const { timestamp } = getSignatureParts(signature)
  const signatureTime = Number(timestamp) * 1000
  const currentTime = Date.now()
  const ttlMilliseconds = config.adminApiSignatureTtl * 1000

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

export async function getTenantIdFromRequestHeaders(
  ctx: TenantedAppContext,
  config: IAppConfig
): Promise<void> {
  const logger = await ctx.container.use('logger')
  const cookie = ctx.request.headers['cookie']
  const session = await axios.get(`${config.kratosPublicUrl}/sessions/whoami`, {
    headers: {
      cookie
    },
    withCredentials: true
  })

  if (session.status !== 200 || !session.data?.active) {
    ctx.throw(401, 'Unauthorized')
  }

  const identityId = session.data?.identity.id
  const tenantService = await ctx.container.use('tenantService')
  const tenant = await tenantService.getByKratosId(identityId)
  if (!tenant) {
    ctx.throw(401, 'Unauthorized')
  }

  ctx.tenantId = tenant.id
  ctx.isOperator = session.data?.identity.metadata_public.operator
}
