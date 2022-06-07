import * as crypto from 'crypto'
import Axios from 'axios'
import { importJWK, JWK } from 'jose'
import { URL } from 'url'

import { BaseService } from '../shared/baseService'
import { IAppConfig } from '../config/app'

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

interface JWKWithRequired extends JWK {
  kid: string
  x: string
  alg: string
  kty: string
  crv: string
}

interface RegistryKey extends JWK {
  exp?: number
  nbf?: number
  revoked?: boolean
}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
}

export interface ClientService {
  verifySig(
    sig: string,
    jwk: JWKWithRequired,
    challenge: string
  ): Promise<boolean>
  validateClientWithRegistry(clientInfo: ClientInfo): Promise<boolean>
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
    validateClientWithRegistry: (clientInfo: ClientInfo) =>
      validateClientWithRegistry(deps, clientInfo)
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
  return crypto.verify(null, data, publicKey, Buffer.from(sig))
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
  const { logger, config } = deps
  const { jwk } = clientInfo.key
  const { keyRegistries } = config

  // No key registries in list means no validation
  if (keyRegistries.length === 0) return true
  if (!validateRequiredJwkProperties(jwk)) return false

  const kidUrl = new URL(jwk.kid)
  if (!keyRegistries.includes(kidUrl.origin)) return false

  const registryData = await Axios.get(jwk.kid)
    .then((res) => res.data)
    .catch((err) => {
      logger.error(
        {
          err,
          kid: jwk.kid
        },
        'failed to validate key'
      )
      return false
    })

  const { keys } = registryData
  if (!keys?.kid || !keys?.x) {
    return false
  }

  return !!(
    verifyClientDisplay(clientInfo.display, registryData.display) &&
    verifyJwk(jwk, keys)
  )
}

function verifyClientDisplay(
  displayInfo: DisplayInfo,
  registryClientInfo: DisplayInfo
): boolean {
  return (
    displayInfo.name === registryClientInfo.name &&
    displayInfo.uri === registryClientInfo.uri
  )
}

function verifyJwk(jwk: JWKWithRequired, keys: RegistryKey): boolean {
  // TODO: update this to reflect eventual shape of response from registry
  return !!(
    !keys.revoked &&
    keys.exp &&
    new Date() < new Date(keys.exp * 1000) &&
    keys.nbf &&
    new Date() >= new Date(keys.nbf * 1000) &&
    keys.x === jwk.x
  )
}
