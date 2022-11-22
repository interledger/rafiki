/* eslint-disable @typescript-eslint/no-explicit-any */

import * as crypto from 'crypto'
import { importJWK } from 'jose'
import { JWK } from 'open-payments'

import { AppContext } from '../app'
import { Grant } from '../grant/model'
import { Context } from 'koa'

export async function verifySig(
  sig: string,
  jwk: JWK,
  challenge: string
): Promise<boolean> {
  const publicKey = (await importJWK(jwk)) as crypto.KeyLike
  const data = Buffer.from(challenge)
  return crypto.verify(null, data, publicKey, Buffer.from(sig, 'base64'))
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

async function verifySigFromClient(
  client: string,
  ctx: HttpSigContext
): Promise<boolean> {
  const clientService = await ctx.container.use('clientService')
  const clientKey = await clientService.getKey({
    client,
    keyId: ctx.clientKeyId
  })

  if (!clientKey) {
    ctx.throw(400, 'invalid client', { error: 'invalid_client' })
  }

  return verifySigAndChallenge(clientKey, ctx)
}

async function verifySigFromBoundKey(
  grant: Grant,
  ctx: HttpSigContext
): Promise<boolean> {
  const sigInput = ctx.headers['signature-input'] as string
  ctx.clientKeyId = getSigInputKeyId(sigInput)
  if (ctx.clientKeyId !== grant.clientKeyId) {
    ctx.throw(401, 'invalid signature input', { error: 'invalid_request' })
  }

  return verifySigFromClient(grant.client, ctx)
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

const KEY_ID_PREFIX = 'keyid="'

function getSigInputKeyId(sigInput: string): string | undefined {
  const keyIdParam = sigInput
    .split(';')
    .find((param) => param.startsWith(KEY_ID_PREFIX))
  // Trim prefix and quotes
  return keyIdParam?.slice(KEY_ID_PREFIX.length, -1)
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

  return !(
    !sigInputComponents.includes('@method') ||
    !sigInputComponents.includes('@target-uri') ||
    (ctx.request.body &&
      Object.keys(ctx.request.body).length > 0 &&
      !sigInputComponents.includes('content-digest')) ||
    (ctx.headers['authorization'] &&
      !sigInputComponents.includes('authorization'))
  )
}

export function sigInputToChallenge(
  sigInput: string,
  ctx: Context
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

type HttpSigHeaders = Record<'signature' | 'signature-input', string>

type HttpSigRequest = Omit<Context['request'], 'headers'> & {
  headers: HttpSigHeaders
}

export type HttpSigContext = Context & {
  request: HttpSigRequest
  headers: HttpSigHeaders
}

function validateHttpSigHeaders(ctx: Context): ctx is HttpSigContext {
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

  await verifySigFromBoundKey(grant, ctx)
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

  const sigInput = ctx.headers['signature-input'] as string
  ctx.clientKeyId = getSigInputKeyId(sigInput)
  if (!ctx.clientKeyId) {
    ctx.throw(401, 'invalid signature input', { error: 'invalid_request' })
  }

  await verifySigFromClient(body.client, ctx)
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
  await verifySigFromBoundKey(grant, ctx)
  await next()
}
