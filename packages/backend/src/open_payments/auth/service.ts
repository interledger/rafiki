import axios from 'axios'
import { KeyInfo } from 'auth'
import { Logger } from 'pino'

import {
  Grant,
  GrantJSON,
  GrantOptions,
  GrantAccess,
  GrantAccessJSON
} from './grant'
import { OpenAPI, HttpMethod, ResponseValidator } from 'openapi'

export interface TokenInfoJSON extends GrantJSON {
  key: KeyInfo
}

export class TokenInfo extends Grant {
  public readonly key: KeyInfo

  constructor(options: GrantOptions, key: KeyInfo) {
    super(options)
    this.key = key
  }

  public toJSON(): TokenInfoJSON {
    return {
      ...super.toJSON(),
      key: this.key
    }
  }
}

export interface AuthService {
  introspect(token: string): Promise<TokenInfo | undefined>
}

interface ServiceDependencies {
  authServerIntrospectionUrl: string
  authOpenApi: OpenAPI
  logger: Logger
  validateResponse: ResponseValidator<TokenInfoJSON>
}

export async function createAuthService(
  deps_: Omit<ServiceDependencies, 'validateResponse'>
): Promise<AuthService> {
  const log = deps_.logger.child({
    service: 'AuthService'
  })
  const validateResponse =
    deps_.authOpenApi.createResponseValidator<TokenInfoJSON>({
      path: '/introspect',
      method: HttpMethod.POST
    })
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log,
    validateResponse
  }
  return {
    introspect: (token) => introspectToken(deps, token)
  }
}

async function introspectToken(
  deps: ServiceDependencies,
  token: string
): Promise<TokenInfo | undefined> {
  try {
    // https://datatracker.ietf.org/doc/html/draft-ietf-gnap-resource-servers#section-3.3
    const requestHeaders = {
      'Content-Type': 'application/json'
      // TODO:
      // 'Signature-Input': 'sig1=...'
      // 'Signature': 'sig1=...'
      // 'Digest': 'sha256=...'
    }

    const { status, data } = await axios.post(
      deps.authServerIntrospectionUrl,
      {
        access_token: token,
        // TODO
        resource_server: '7C7C4AZ9KHRS6X63AJAO'
        // proof: 'httpsig'
      },
      {
        headers: requestHeaders,
        validateStatus: (status) => status === 200
      }
    )

    deps.validateResponse({
      status,
      body: data
    })

    const options: GrantOptions = {
      active: data.active,
      clientId: data.client_id,
      grant: data.grant
    }
    if (data.access) {
      options.access = data.access.map(
        (access: GrantAccessJSON): GrantAccess => {
          const options: GrantAccess = {
            type: access.type,
            actions: access.actions,
            identifier: access.identifier,
            interval: access.interval
          }
          if (access.limits) {
            options.limits = {
              receiver: access.limits.receiver
            }
            if (access.limits.sendAmount) {
              options.limits.sendAmount = {
                value: BigInt(access.limits.sendAmount.value),
                assetCode: access.limits.sendAmount.assetCode,
                assetScale: access.limits.sendAmount.assetScale
              }
            }
            if (access.limits.receiveAmount) {
              options.limits.receiveAmount = {
                value: BigInt(access.limits.receiveAmount.value),
                assetCode: access.limits.receiveAmount.assetCode,
                assetScale: access.limits.receiveAmount.assetScale
              }
            }
          }
          return options
        }
      )
    }
    return new TokenInfo(options, data.key)
  } catch (err) {
    if (err.errors) {
      deps.logger.warn({ err }, 'invalid token introspection')
    }
    return
  }
}
