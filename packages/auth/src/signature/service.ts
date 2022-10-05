import * as crypto from 'crypto'
import { importJWK } from 'jose'
import { HttpMethod } from 'openapi'

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenHttpsigMiddleware: (ctx: AppContext, next: () => Promise<any>) =>
      tokenHttpsigMiddleware(deps, ctx, next)
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

  return {
    success: await verifySig(
      deps,
      sig.replace('sig1=', ''),
      clientKey,
      challenge
    )
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

async function tokenHttpsigMiddleware(
  deps: ServiceDependencies,
  ctx: AppContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  next: () => Promise<any>
): Promise<void> {
  const sig = ctx.headers['signature']
  const sigInput = ctx.headers['signature-input']

  if (
    !sig ||
    !sigInput ||
    typeof sig !== 'string' ||
    typeof sigInput !== 'string'
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'invalid_request',
      message: 'invalid signature headers'
    }
    return
  }

  const { body } = ctx.request
  const { path, method } = ctx
  let verified: VerifySigResult
  if (
    path.includes('/introspect') &&
    method === HttpMethod.POST.toUpperCase()
  ) {
    const accessToken = await deps.accessTokenService.get(body['access_token'])
    if (!accessToken) {
      ctx.status = 401
      ctx.body = {
        error: 'invalid_client',
        message: 'invalid access token'
      }

      return
    }

    const grant = await deps.grantService.get(accessToken.grantId)
    verified = await verifySigFromBoundKey(deps, sig, sigInput, grant, ctx)
  } else if (
    path.includes('/token') &&
    method === HttpMethod.DELETE.toUpperCase()
  ) {
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
    verified = await verifySigFromBoundKey(deps, sig, sigInput, grant, ctx)
  } else if (path.includes('/continue')) {
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
    verified = await verifySigFromBoundKey(deps, sig, sigInput, grant, ctx)
  } else if (path === '/' && method === HttpMethod.POST.toUpperCase()) {
    if (!(await deps.clientService.validateClient(body.client))) {
      ctx.status = 401
      ctx.body = { error: 'invalid_client' }
      return
    }

    verified = await verifySigAndChallenge(
      deps,
      sig,
      sigInput,
      body.client.key.jwk,
      ctx
    )
  } else {
    // route does not need httpsig verification
    await next()
    return
  }

  if (!verified.success) {
    ctx.status = verified.status || 401
    ctx.body = {
      error: verified.error || 'request_denied',
      message: verified.message || null
    }
    return
  }

  await next()
}
