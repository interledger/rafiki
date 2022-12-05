import * as crypto from 'crypto'
import { verifyContentDigest } from 'httpbis-digest-headers'
import { importJWK } from 'jose'
import { Context } from 'koa'
import { JWK } from './jwk'

type HttpSigHeaders = Record<'signature' | 'signature-input', string>

type HttpSigRequest = Omit<Context['request'], 'headers'> & {
  headers: HttpSigHeaders
}

export type HttpSigContext = Context & {
  request: HttpSigRequest
  headers: HttpSigHeaders
}

export function validateHttpSigHeaders(ctx: Context): ctx is HttpSigContext {
  const sig = ctx.headers['signature']
  const sigInput = ctx.headers['signature-input'] as string

  const sigInputComponents = getSigInputComponents(sigInput ?? '')
  if (
    !sigInputComponents ||
    !validateSigInputComponents(sigInputComponents, ctx)
  )
    return false

  return (
    sig && sigInput && typeof sig === 'string' && typeof sigInput === 'string'
  )
}

export async function verifySigAndChallenge(
  clientKey: JWK,
  ctx: HttpSigContext
): Promise<boolean> {
  const sig = ctx.headers['signature'] as string
  const sigInput = ctx.headers['signature-input'] as string
  const challenge = sigInputToChallenge(sigInput, ctx)
  if (!challenge) {
    ctx.throw(400, 'invalid signature input', { error: 'invalid_request' })
  }

  const verified = await verifySig(
    sig.replace('sig1=', ''),
    clientKey,
    challenge
  )

  if (verified) {
    return true
  } else {
    ctx.throw(401, 'invalid signature')
  }
}

async function verifySig(
  sig: string,
  jwk: JWK,
  challenge: string
): Promise<boolean> {
  const publicKey = (await importJWK(jwk)) as crypto.KeyLike
  const data = Buffer.from(challenge)
  return crypto.verify(null, data, publicKey, Buffer.from(sig, 'base64'))
}

function sigInputToChallenge(sigInput: string, ctx: Context): string | null {
  const sigInputComponents = getSigInputComponents(sigInput)

  if (
    !sigInputComponents ||
    !validateSigInputComponents(sigInputComponents, ctx)
  )
    return null

  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-09#section-2.3
  let signatureBase = ''
  for (const component of sigInputComponents) {
    if (component === '@method') {
      signatureBase += `"@method": ${ctx.request.method}\n`
    } else if (component === '@target-uri') {
      signatureBase += `"@target-uri": ${ctx.request.href}\n`
    } else {
      signatureBase += `"${component}": ${ctx.headers[component]}\n`
    }
  }

  signatureBase += `"@signature-params": ${(
    ctx.headers['signature-input'] as string
  )?.replace('sig1=', '')}`
  return signatureBase
}

// TODO: Replace with public httpsig library
function getSigInputComponents(sigInput: string): string[] | null {
  // https://datatracker.ietf.org/doc/html/rfc8941#section-4.1.1.1
  const messageComponents = sigInput
    .split('sig1=')[1]
    ?.split(';')[0]
    ?.split(' ')
  return messageComponents
    ? messageComponents.map((component) => component.replace(/[()"]/g, ''))
    : null
}

function validateSigInputComponents(
  sigInputComponents: string[],
  ctx: Context
): boolean {
  // https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-7.3.1

  for (const component of sigInputComponents) {
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-09#section-2.1
    if (component !== component.toLowerCase()) return false
  }

  const isValidContentDigest =
    !sigInputComponents.includes('content-digest') ||
    (!!ctx.headers['content-digest'] &&
      ctx.request.body &&
      Object.keys(ctx.request.body).length > 0 &&
      sigInputComponents.includes('content-digest') &&
      verifyContentDigest(
        JSON.stringify(ctx.request.body),
        ctx.headers['content-digest'] as string
      ))

  return !(
    !isValidContentDigest ||
    !sigInputComponents.includes('@method') ||
    !sigInputComponents.includes('@target-uri') ||
    (ctx.headers['authorization'] &&
      !sigInputComponents.includes('authorization'))
  )
}
