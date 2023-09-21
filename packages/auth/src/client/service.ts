import { UnauthenticatedClient } from '@interledger/open-payments'
import { JWK } from '@interledger/http-signature-utils'

import { BaseService } from '../shared/baseService'

export interface ClientKey {
  jwk: JWK
  client: ClientDetails
}

interface ClientDetails {
  // id: string
  name: string
  // image: string
  uri: string
  // email: string
}

interface ServiceDependencies extends BaseService {
  openPaymentsClient: UnauthenticatedClient
}

export interface KeyOptions {
  client: string
  keyId: string
}

export interface ClientService {
  get(client: string): Promise<ClientDetails | undefined>
  getKey(options: KeyOptions): Promise<JWK | undefined>
}

export async function createClientService(
  deps_: ServiceDependencies
): Promise<ClientService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({
      service: 'ClientService'
    })
  }

  return {
    get: (client: string) => getClient(deps, client),
    getKey: (options: KeyOptions) => getClientKey(deps, options)
  }
}

async function getClient(
  deps: ServiceDependencies,
  client: string
): Promise<ClientDetails | undefined> {
  try {
    const walletAddress = await deps.openPaymentsClient.walletAddress.get({
      url: client
    })
    // TODO: https://github.com/interledger/rafiki/issues/734
    if (!walletAddress.publicName) {
      deps.logger.debug('Wallet address does not have a public name.')
      return
    }
    return {
      name: walletAddress.publicName,
      uri: client
    }
  } catch (error) {
    deps.logger.debug(
      {
        error,
        client
      },
      'retrieving client display info'
    )
    return undefined
  }
}

async function getClientKey(
  deps: ServiceDependencies,
  { client, keyId }: KeyOptions
): Promise<JWK | undefined> {
  try {
    const { keys } = await deps.openPaymentsClient.walletAddress.getKeys({
      url: client
    })

    return keys.find((key: JWK) => key.kid === keyId)
  } catch (error) {
    deps.logger.debug(
      {
        error,
        client
      },
      'retrieving client key'
    )
    return undefined
  }
}
