/* eslint-disable @typescript-eslint/no-explicit-any */

import * as crypto from 'crypto'
import { importJWK } from 'jose'

import { AppContext } from '../app'
import { Grant } from '../grant/model'
import { JWKWithRequired } from '../client/service'

interface VerifySigResult {
  success: boolean
  status?: number
  error?: string
  message?: string
}

export async function verifySig(
  sig: string,
  jwk: JWKWithRequired,
  challenge: string
): Promise<boolean> {
  const publicKey = (await importJWK(jwk)) as crypto.KeyLike
  const data = Buffer.from(challenge)
  return crypto.verify(null, data, publicKey, Buffer.from(sig, 'base64'))
}

async function verifySigAndChallenge(
  clientKey: JWKWithRequired,
  ctx: HttpSigContext
): Promise<VerifySigResult> {
  const sig = ctx.headers['signature'] as string
  const sigInput = ctx.headers['signature-input'] as string
  const challenge = sigInputToChallenge(sigInput, ctx)
  if (!challenge) {
    return {
      success: false,
      status: 400,
      error: 'invalid_request',
      message: 'invalid Sig-Input'
    }
  }

  try {
    return {
      success: await verifySig(sig.replace('sig1=', ''), clientKey, challenge)
    }
  } catch (err) {
    const logger = await ctx.container.use('logger')
    logger.error(
      {
        error: err
      },
      'failed to verify signature'
    )
    return {
      success: false
    }
  }
}

async function verifySigFromBoundKey(
  grant: Grant,
  ctx: HttpSigContext
): Promise<VerifySigResult> {
  const clientService = await ctx.container.use('clientService')
  const { jwk } = await clientService.getKeyByKid(grant.clientKeyId)
  if (!jwk)
    return {
      success: false,
      error: 'invalid_client',
      status: 401
    }

  return verifySigAndChallenge(jwk, ctx)
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
  ctx: AppContext
): boolean {
  // https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-7.3.1

  for (const component of sigInputComponents) {
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-09#section-2.1
    if (component !== component.toLowerCase()) return false
  }

  return !(
    !sigInputComponents.includes('@method') ||
    !sigInputComponents.includes('@target-uri') ||
    (ctx.request.body && !sigInputComponents.includes('content-digest')) ||
    (ctx.headers['authorization'] &&
      !sigInputComponents.includes('authorization'))
  )
}

export function sigInputToChallenge(
  sigInput: string,
  ctx: AppContext
): string | null {
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
      signatureBase += `"@target-uri": ${ctx.request.url}\n`
    } else {
      signatureBase += `"${component}": ${ctx.headers[component]}\n`
    }
  }

  signatureBase += `"@signature-params": ${(
    ctx.headers['signature-input'] as string
  )?.replace('sig1=', '')}`
  return signatureBase
}

type HttpSigRequest = Omit<AppContext['request'], 'headers'> & {
  headers: Record<'signature' | 'signature-input', string>
}

type HttpSigContext = AppContext & {
  request: HttpSigRequest
}

function validateHttpSigHeaders(ctx: AppContext): ctx is HttpSigContext {
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

function handleVerifySigResult(
  verified: VerifySigResult,
  ctx: HttpSigContext
): boolean {
  if (!verified.success) {
    ctx.throw(verified.status ?? 401, verified.message, {
      error: 'request_denied'
    })
  }

  return true
}

export async function grantContinueHttpsigMiddleware(
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateHttpSigHeaders(ctx)) {
    ctx.status = 400
    ctx.body = {
      error: 'invalid_request',
      message: 'invalid signature headers'
    }
    return
  }

  const continueToken = ctx.headers['authorization'].replace(
    'GNAP ',
    ''
  ) as string
  const { interact_ref: interactRef } = ctx.request.body

  const logger = await ctx.container.use('logger')
  logger.info(
    {
      continueToken,
      interactRef,
      continueId: ctx.params['id']
    },
    'httpsig for continue'
  )

  const grantService = await ctx.container.use('grantService')
  const grant = await grantService.getByContinue(
    ctx.params['id'],
    continueToken,
    interactRef
  )
  if (!grant) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_interaction',
      message: 'invalid grant'
    }
    return
  }
  const verified = await verifySigFromBoundKey(grant, ctx)

  handleVerifySigResult(verified, ctx)
  await next()
}

export async function grantInitiationHttpsigMiddleware(
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateHttpSigHeaders(ctx)) {
    ctx.status = 400
    ctx.body = {
      error: 'invalid_request',
      message: 'invalid signature headers'
    }
    return
  }

  const { body } = ctx.request

  const clientService = await ctx.container.use('clientService')
  if (!(await clientService.validateClient(body.client))) {
    ctx.status = 401
    ctx.body = { error: 'invalid_client' }
    return
  }

  const verified = await verifySigAndChallenge(body.client.key.jwk, ctx)

  handleVerifySigResult(verified, ctx)
  await next()
}

export async function tokenHttpsigMiddleware(
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateHttpSigHeaders(ctx)) {
    ctx.status = 400
    ctx.body = {
      error: 'invalid_request',
      message: 'invalid signature headers'
    }
    return
  }

  const accessTokenService = await ctx.container.use('accessTokenService')
  const accessToken = await accessTokenService.getByManagementId(
    ctx.params['id']
  )
  if (!accessToken) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_client',
      message: 'invalid access token'
    }
    return
  }

  const grantService = await ctx.container.use('grantService')
  const grant = await grantService.get(accessToken.grantId)
  const verified = await verifySigFromBoundKey(grant, ctx)

  handleVerifySigResult(verified, ctx)
  await next()
}
