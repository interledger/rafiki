/* eslint-disable @typescript-eslint/no-explicit-any */

import * as crypto from 'crypto'
import { importJWK } from 'jose'

import { AppContext } from '../app'
import { BaseService } from '../shared/baseService'
import { IAppConfig } from '../config/app'
import { Grant } from '../grant/model'
import { GrantService } from '../grant/service'
import { AccessTokenService } from '../accessToken/service'
import { ClientService, JWKWithRequired } from '../client/service'

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  grantService: GrantService
  accessTokenService: AccessTokenService
  clientService: ClientService
}

interface VerifySigResult {
  success: boolean
  status?: number
  error?: string
  message?: string
}

export interface SignatureService {
  verifySig(
    sig: string,
    jwk: JWKWithRequired,
    challenge: string
  ): Promise<boolean>
  sigInputToChallenge(sigInput: string, ctx: AppContext): string | null
  tokenHttpsigMiddleware(
    ctx: AppContext,
    next: () => Promise<any>
  ): Promise<void>
  grantContinueHttpsigMiddleware(
    ctx: AppContext,
    next: () => Promise<any>
  ): Promise<void>
  grantInitiationHttpsigMiddleware(
    ctx: AppContext,
    next: () => Promise<any>
  ): Promise<void>
}

export async function createSignatureService({
  logger,
  config,
  grantService,
  accessTokenService,
  clientService
}: ServiceDependencies): Promise<SignatureService> {
  const log = logger.child({
    service: 'SignatureService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    config,
    grantService,
    accessTokenService,
    clientService
  }

  return {
    verifySig: (sig: string, jwk: JWKWithRequired, challenge: string) =>
      verifySig(deps, sig, jwk, challenge),
    sigInputToChallenge: (sigInput: string, ctx: AppContext) =>
      sigInputToChallenge(sigInput, ctx),
    tokenHttpsigMiddleware: (ctx: AppContext, next: () => Promise<any>) =>
      tokenHttpsigMiddleware(deps, ctx, next),
    grantContinueHttpsigMiddleware: (
      ctx: AppContext,
      next: () => Promise<any>
    ) => grantContinueHttpsigMiddleware(deps, ctx, next),
    grantInitiationHttpsigMiddleware: (
      ctx: AppContext,
      next: () => Promise<any>
    ) => grantInitiationHttpsigMiddleware(deps, ctx, next)
  }
}

async function verifySig(
  deps: ServiceDependencies,
  sig: string,
  jwk: JWKWithRequired,
  challenge: string
): Promise<boolean> {
  const publicKey = (await importJWK(jwk)) as crypto.KeyLike
  const data = Buffer.from(challenge)
  return crypto.verify(null, data, publicKey, Buffer.from(sig, 'base64'))
}

async function verifySigAndChallenge(
  deps: ServiceDependencies,
  sig: string,
  sigInput: string,
  clientKey: JWKWithRequired,
  ctx: AppContext
): Promise<VerifySigResult> {
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
      success: await verifySig(
        deps,
        sig.replace('sig1=', ''),
        clientKey,
        challenge
      )
    }
  } catch (err) {
    deps.logger.error(
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
  deps: ServiceDependencies,
  sig: string,
  sigInput: string,
  grant: Grant,
  ctx: AppContext
): Promise<VerifySigResult> {
  const { jwk } = await deps.clientService.getKeyByKid(grant.clientKeyId)
  if (!jwk)
    return {
      success: false,
      error: 'invalid_client',
      status: 401
    }

  return verifySigAndChallenge(deps, sig, sigInput, jwk, ctx)
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

function sigInputToChallenge(sigInput: string, ctx: AppContext): string | null {
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

async function grantContinueHttpsigMiddleware(
  deps: ServiceDependencies,
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

  const sig = ctx.headers['signature'] as string
  const sigInput = ctx.headers['signature-input'] as string

  const grant = await deps.grantService.getByInteraction(
    ctx.params['interactId']
  )
  if (!grant) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_interaction',
      message: 'invalid grant'
    }
    return
  }
  const verified = await verifySigFromBoundKey(deps, sig, sigInput, grant, ctx)

  handleVerifySigResult(verified, ctx)
  await next()
}

async function grantInitiationHttpsigMiddleware(
  deps: ServiceDependencies,
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

  const sig = ctx.headers['signature'] as string
  const sigInput = ctx.headers['signature-input'] as string
  const { body } = ctx.request

  if (!(await deps.clientService.validateClient(body.client))) {
    ctx.status = 401
    ctx.body = { error: 'invalid_client' }
    return
  }

  const verified = await verifySigAndChallenge(
    deps,
    sig,
    sigInput,
    body.client.key.jwk,
    ctx
  )

  handleVerifySigResult(verified, ctx)
  await next()
}

async function tokenHttpsigMiddleware(
  deps: ServiceDependencies,
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

  const sig = ctx.headers['signature'] as string
  const sigInput = ctx.headers['signature-input'] as string
  const accessToken = await deps.accessTokenService.getByManagementId(
    ctx.params['managementId']
  )
  if (!accessToken) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_client',
      message: 'invalid access token'
    }
    return
  }

  const grant = await deps.grantService.get(accessToken.grantId)
  const verified = await verifySigFromBoundKey(deps, sig, sigInput, grant, ctx)

  handleVerifySigResult(verified, ctx)
  await next()
}
