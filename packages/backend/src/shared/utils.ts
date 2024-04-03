import { validate, version } from 'uuid'
import { URL, type URL as URLType } from 'url'
import { Context } from 'koa'
import { createHmac } from 'crypto'
import { canonicalize } from 'json-canonicalize'
import { IAppConfig } from '../config/app'

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

export function verifyApiSignature(ctx: Context, config: IAppConfig): boolean {
  const { headers, body } = ctx.request
  const signature = headers['signature']
  if (!signature) {
    return false
  }

  const signatureParts = (signature as string)?.split(', ')
  const timestamp = signatureParts[0].split('=')[1]
  const signatureDigest = signatureParts[1].split('=')[1]

  const payload = `${timestamp}.${canonicalize(body)}`
  const hmac = createHmac('sha256', config.apiSecret as string)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return digest === signatureDigest
}
