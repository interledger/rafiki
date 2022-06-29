import * as crypto from 'crypto'
import Axios from 'axios'
import { importJWK, JWK } from 'jose'
import { URL } from 'url'

import { BaseService } from '../shared/baseService'
import { IAppConfig } from '../config/app'
import { AppContext } from '../app'
import { AccessToken } from '../accessToken/model'
import { Grant } from '../grant/model'

interface DisplayInfo {
  name: string
  url: string
}

export interface KeyInfo {
  proof: string
  jwk: JWKWithRequired
}

export interface ClientInfo {
  display: DisplayInfo
  key: KeyInfo
}

interface RegistryData {
  id: string
  name: string
  image: string
  url: string
  email: string
  keys: RegistryKey[]
}

export interface JWKWithRequired extends JWK {
  kid: string
  x: string
  alg: string
  kty: string
  crv: string
}

interface RegistryKey extends JWKWithRequired {
  exp?: number
  nbf?: number
  revoked?: boolean
}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
}

interface VerifySigFromBoundKeyResult {
  success: boolean
  status?: number
  error?: string
  message?: string
}

export interface ClientService {
  verifySig(
    sig: string,
    jwk: JWKWithRequired,
    challenge: string
  ): Promise<boolean>
  verifySigFromBoundKey(
    sig: string,
    sigInput: string,
    accessTokenKey: string,
    accessTokenValue: string,
    ctx: AppContext
  ): Promise<VerifySigFromBoundKeyResult>
  validateClientWithRegistry(clientInfo: ClientInfo): Promise<boolean>
  getRegistryDataByKid(kid: string): Promise<RegistryData>
  sigInputToChallenge(sigInput: string, ctx: AppContext): string | null
}

export async function createClientService({
  logger,
  config
}: ServiceDependencies): Promise<ClientService> {
  const log = logger.child({
    service: 'ClientService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    config
  }

  return {
    verifySig: (sig: string, jwk: JWKWithRequired, challenge: string) =>
      verifySig(deps, sig, jwk, challenge),
    verifySigFromBoundKey: (
      sig: string,
      sigInput: string,
      accessTokenKey: string,
      accessTokenValue: string,
      ctx: AppContext
    ) =>
      verifySigFromBoundKey(
        deps,
        sig,
        sigInput,
        accessTokenKey,
        accessTokenValue,
        ctx
      ),
    validateClientWithRegistry: (clientInfo: ClientInfo) =>
      validateClientWithRegistry(deps, clientInfo),
    getRegistryDataByKid: (kid: string) => getRegistryDataByKid(deps, kid),
    sigInputToChallenge: (sigInput: string, ctx: AppContext) =>
      sigInputToChallenge(sigInput, ctx)
  }
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
    if (component === '@method') {
      signatureBase += `"@method": ${ctx.request.method}\n`
    } else if (component === '@target-uri') {
      signatureBase += `"@target-uri": ${ctx.request.url}\n`
    } else {
      signatureBase += `"${component}": ${ctx.headers[component]}\n`
    }
  }

  signatureBase += `"@signature-params": ${(ctx.headers[
    'signature-input'
  ] as string)?.replace('sig1=', '')}`
  return signatureBase
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

async function verifySigFromBoundKey(
  deps: ServiceDependencies,
  sig: string,
  sigInput: string,
  accessTokenKey: string,
  accessTokenValue: string,
  ctx: AppContext
): Promise<VerifySigFromBoundKeyResult> {
  const accessToken = await AccessToken.query().findOne(
    accessTokenKey,
    accessTokenValue
  )
  if (!accessToken) {
    return {
      success: false,
      error: 'invalid_client',
      status: 404,
      message: 'token not found'
    }
  }
  const grant = await Grant.query().findById(accessToken.grantId)

  const registryData = await getRegistryDataByKid(deps, grant.clientKeyId)
  if (!registryData)
    return {
      success: false,
      error: 'invalid_client',
      status: 401
    }
  const { keys } = registryData
  const clientKey = keys[0]

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

function validateRequiredJwkProperties(jwk: JWKWithRequired): boolean {
  if (
    jwk.kty !== 'OKP' ||
    (jwk.use && jwk.use !== 'sig') ||
    (jwk.key_ops &&
      (!jwk.key_ops.includes('sign') || !jwk.key_ops.includes('verify'))) ||
    jwk.alg !== 'EdDSA' ||
    jwk.crv !== 'Ed25519'
  ) {
    return false
  }

  return true
}

async function validateClientWithRegistry(
  deps: ServiceDependencies,
  clientInfo: ClientInfo
): Promise<boolean> {
  const { config } = deps
  const { jwk } = clientInfo.key
  const { keyRegistries } = config

  // No key registries in list means no validation
  if (keyRegistries.length === 0) return true
  if (!validateRequiredJwkProperties(jwk)) return false

  const kidUrl = new URL(jwk.kid)
  if (!keyRegistries.includes(kidUrl.origin)) return false

  const { keys, ...registryClientInfo } = await getRegistryDataByKid(
    deps,
    jwk.kid
  )

  if (!keys || !keys[0].kid || !keys[0].x) {
    return false
  }

  return !!(
    verifyClientDisplay(clientInfo.display, registryClientInfo) &&
    verifyJwk(jwk, keys[0])
  )
}

async function getRegistryDataByKid(
  deps: ServiceDependencies,
  kid: string
): Promise<RegistryData> {
  const registryData = await Axios.get(kid)
    .then((res) => res.data)
    .catch((err) => {
      deps.logger.error(
        {
          err,
          kid: kid
        },
        'failed to fetch client info'
      )
      return false
    })

  return registryData
}

function verifyClientDisplay(
  displayInfo: DisplayInfo,
  registryClientInfo: DisplayInfo
): boolean {
  return (
    displayInfo.name === registryClientInfo.name &&
    displayInfo.url === registryClientInfo.url
  )
}

function isJwkViable(keys: RegistryKey): boolean {
  return !!(
    (!keys.exp || new Date() < new Date(keys.exp * 1000)) &&
    (!keys.nbf || new Date() >= new Date(keys.nbf * 1000))
  )
}

function verifyJwk(jwk: JWKWithRequired, keys: RegistryKey): boolean {
  // TODO: update this to reflect eventual shape of response from registry
  return !!(!keys.revoked && isJwkViable(keys) && keys.x === jwk.x)
}
