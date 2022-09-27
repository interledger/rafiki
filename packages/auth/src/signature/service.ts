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
  introspectionHttpsigMiddleware(
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
    introspectionHttpsigMiddleware: (
      ctx: AppContext,
      next: () => Promise<any>
    ) => introspectionHttpsigMiddleware(deps, ctx, next),
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
function sigInputToChallenge(sigInput: string, ctx: AppContext): string | null {
  // https://datatracker.ietf.org/doc/html/rfc8941#section-4.1.1.1
  const messageComponents = sigInput.split('sig1=')[1].split(';')[0].split(' ')
  const cleanMessageComponents = messageComponents.map((component) =>
    component.replace(/[()"]/g, '')
  )

  // https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-7.3.1
  if (
    !cleanMessageComponents.includes('@method') ||
    !cleanMessageComponents.includes('@target-uri') ||
    (ctx.request.body && !cleanMessageComponents.includes('content-digest')) ||
    (ctx.headers['authorization'] &&
      !cleanMessageComponents.includes('authorization'))
  ) {
    return null
  }

  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-09#section-2.3
  let signatureBase = ''
  for (const component of cleanMessageComponents) {
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-09#section-2.1
    if (component !== component.toLowerCase()) {
      return null
    }

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

interface ValidateHttpSigHeadersResult {
  success: boolean
  status?: number
  body?: {
    error: string
    message: string
  }
  sig?: string
  sigInput?: string
}

// TODO: maybe refactor into handler for next()
function validateHttpSigHeaders(ctx: AppContext): ValidateHttpSigHeadersResult {
  const sig = ctx.headers['signature']
  const sigInput = ctx.headers['signature-input']

  if (
    !sig ||
    !sigInput ||
    typeof sig !== 'string' ||
    typeof sigInput !== 'string'
  ) {
    return {
      success: false,
      status: 400,
      body: {
        error: 'invalid_request',
        message: 'invalid signature headers'
      }
    }
  }

  return {
    success: true,
    sig,
    sigInput
  }
}

async function handleVerifySigResult(
  verified: VerifySigResult,
  ctx: AppContext,
  next: () => Promise<void>
): Promise<void> {
  if (!verified.success) {
    ctx.status = verified.status || 401
    ctx.body = {
      error: verified.error || 'request_denied',
      message: verified.message || null
    }
    await next()
    return
  }

  await next()
}

async function introspectionHttpsigMiddleware(
  deps: ServiceDependencies,
  ctx: AppContext,
  next: () => Promise<void>
): Promise<void> {
  const validateHttpSigHeadersResult = validateHttpSigHeaders(ctx)
  if (!validateHttpSigHeadersResult.success) {
    const { status, body } = validateHttpSigHeadersResult
    ctx.status = status
    ctx.body = body
    next()
    return
  }
  const { sig, sigInput } = validateHttpSigHeadersResult
  const { body } = ctx.request

  const verified = await verifySigAndChallenge(
    deps,
    sig,
    sigInput,
    body.resource_server?.key?.jwk, // https://datatracker.ietf.org/doc/html/draft-ietf-gnap-resource-servers#section-3.2
    ctx
  )

  await handleVerifySigResult(verified, ctx, next)
}

async function grantContinueHttpsigMiddleware(
  deps: ServiceDependencies,
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  const validateHttpSigHeadersResult = validateHttpSigHeaders(ctx)
  if (!validateHttpSigHeadersResult.success) {
    const { status, body } = validateHttpSigHeadersResult
    ctx.status = status
    ctx.body = body
    next()
    return
  }

  const { sig, sigInput } = validateHttpSigHeadersResult

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

  await handleVerifySigResult(verified, ctx, next)
}

async function grantInitiationHttpsigMiddleware(
  deps: ServiceDependencies,
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  const validateHttpSigHeadersResult = validateHttpSigHeaders(ctx)
  if (!validateHttpSigHeadersResult.success) {
    const { status, body } = validateHttpSigHeadersResult
    ctx.status = status
    ctx.body = body
    next()
    return
  }

  const { sig, sigInput } = validateHttpSigHeadersResult
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

  await handleVerifySigResult(verified, ctx, next)
}

async function tokenHttpsigMiddleware(
  deps: ServiceDependencies,
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  const validateHttpSigHeadersResult = validateHttpSigHeaders(ctx)
  if (!validateHttpSigHeadersResult.success) {
    const { status, body } = validateHttpSigHeadersResult
    ctx.status = status
    ctx.body = body
    next()
    return
  }

  const { sig, sigInput } = validateHttpSigHeadersResult
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

  await handleVerifySigResult(verified, ctx, next)
}
