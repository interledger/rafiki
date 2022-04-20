import * as crypto from 'crypto'
import { importJWK, JWK } from 'jose'

import { BaseService as ServiceDependencies } from '../shared/baseService'

export interface ClientService {
  verifySig(sig: string, jwk: JWK, challenge: string): Promise<boolean>
}

export async function createClientService({
  logger
}: ServiceDependencies): Promise<ClientService> {
  const log = logger.child({
    service: 'ClientService'
  })

  const deps: ServiceDependencies = {
    logger: log
  }

  return {
    verifySig: (sig: string, jwk: JWK, challenge: string) =>
      verifySig(deps, sig, jwk, challenge)
  }
}

async function verifySig(
  deps: ServiceDependencies,
  sig: string,
  jwk: JWK,
  challenge: string
): Promise<boolean> {
  const publicKey = (await importJWK(jwk)) as crypto.KeyLike
  const data = Buffer.from(challenge)
  return crypto.verify(null, data, publicKey, Buffer.from(sig))
}
