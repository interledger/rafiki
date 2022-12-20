import axios from 'axios'
import { Logger } from 'pino'

import { AccessAction, AccessType } from './grant'
import { OpenAPI, HttpMethod, ResponseValidator } from 'openapi'
import { JWK } from 'http-signature-utils'
import { AmountJSON } from '../amount'

export interface KeyInfo {
  proof: string
  jwk: JWK
}

export interface AccessLimits {
  receiver?: string
  sendAmount?: AmountJSON
  receiveAmount?: AmountJSON
  interval?: string
}

export interface Access {
  type: AccessType
  actions: AccessAction[]
  identifier?: string
  limits?: AccessLimits
}

export interface TokenInfo {
  active: boolean
  grant: string
  client_id: string
  access?: Access[]
  key: KeyInfo
}

export interface AuthService {
  introspect(token: string): Promise<TokenInfo | undefined>
}

interface ServiceDependencies {
  authServerIntrospectionUrl: string
  tokenIntrospectionSpec: OpenAPI
  logger: Logger
  validateResponse: ResponseValidator<TokenInfo>
}

export async function createAuthService(
  deps_: Omit<ServiceDependencies, 'validateResponse'>
): Promise<AuthService> {
  const log = deps_.logger.child({
    service: 'AuthService'
  })
  const validateResponse =
    deps_.tokenIntrospectionSpec.createResponseValidator<TokenInfo>({
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

    return data.active ? data : undefined

    return data
  } catch (err) {
    if (err.errors) {
      deps.logger.warn({ err }, 'invalid token introspection')
    }
    return
  }
}
