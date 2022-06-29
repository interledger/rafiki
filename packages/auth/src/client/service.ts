import * as crypto from 'crypto'
import Axios from 'axios'
import { importJWK, JWK } from 'jose'

import { BaseService } from '../shared/baseService'
import { IAppConfig } from '../config/app'
import { AppContext } from '../app'
import { AccessToken } from '../accessToken/model'
import { Grant } from '../grant/model'

export interface JWKWithRequired extends JWK {
  // client is the custom field representing a client in the backend
  client: ClientDetails
  kid: string
  x: string
  alg: string
  kty: string
  crv: string
  exp?: number
  nbf?: number
  revoked?: boolean
}

interface DisplayInfo {
  name: string
  uri: string
}

export interface KeyInfo {
  proof: string
  jwk: JWKWithRequired
}

export interface ClientInfo {
  display: DisplayInfo
  key: KeyInfo
}

interface ClientDetails {
  id: string
  name: string
  image: string
  uri: string
  email: string
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
  validateClient(clientInfo: ClientInfo): Promise<boolean>
  getKeyByKid(kid: string): Promise<JWKWithRequired>
  verifySigFromBoundKey(
    sig: string,
    sigInput: string,
    accessTokenKey: string,
    accessTokenValue: string,
    ctx: AppContext
  ): Promise<boolean>
  sigInputToChallenge(sigInput: string, ctx: AppContext): string
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
    validateClient: (clientInfo: ClientInfo) =>
      validateClient(deps, clientInfo),
    getKeyByKid: (kid: string) => getKeyByKid(deps, kid),
    ) =>
      verifySigFromBoundKey(
        deps,
        sig,
        sigInput,
        accessTokenKey,
        accessTokenValue,
        ctx
      ),
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

async function validateClient(
  deps: ServiceDependencies,
  clientInfo: ClientInfo
): Promise<boolean> {
  if (!isClientInfo(clientInfo)) return false

  const { jwk } = clientInfo.key

  const key = await getKeyByKid(deps, jwk.kid)

  if (!key || !isJWKWithRequired(key) || jwk.x !== key.x || key.revoked)
    return false

  if (
    jwk.client.name !== key.client.name ||
    jwk.client.uri !== key.client.uri ||
    jwk.client.id !== key.client.id ||
    clientInfo.display.name !== key.client.name ||
    clientInfo.display.uri !== key.client.uri
  )
    return false

  if (key.exp && new Date() >= new Date(key.exp * 1000)) return false
  if (key.nbf && new Date() < new Date(key.nbf * 1000)) return false

  return true
}

async function getKeyByKid(
  deps: ServiceDependencies,
  kid: string
): Promise<JWKWithRequired> {
  return Axios.get(kid)
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
}

function isJWKWithRequired(
  jwkWithRequired: unknown
): jwkWithRequired is JWKWithRequired {
  const jwk = jwkWithRequired as JWKWithRequired
  return !(
    jwk.kty !== 'OKP' ||
    (jwk.use && jwk.use !== 'sig') ||
    (jwk.key_ops &&
      (!jwk.key_ops.includes('sign') || !jwk.key_ops.includes('verify'))) ||
    jwk.alg !== 'EdDSA' ||
    jwk.crv !== 'Ed25519' ||
    jwk.client === undefined
  )
}

function isDisplayInfo(display: unknown): display is DisplayInfo {
  return (
    (display as DisplayInfo).name !== undefined &&
    (display as DisplayInfo).uri !== undefined
  )
}

function isKeyInfo(key: unknown): key is KeyInfo {
  return (
    (key as KeyInfo).proof !== undefined &&
    isJWKWithRequired((key as KeyInfo).jwk)
  )
}

function isClientInfo(client: unknown): client is ClientInfo {
  return (
    isDisplayInfo((client as ClientInfo).display) &&
    isKeyInfo((client as ClientInfo).key)
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
