import assert from 'assert'
import axios from 'axios'
import { Logger } from 'pino'

import {
  Grant,
  GrantJSON,
  GrantOptions,
  GrantAccess,
  GrantAccessJSON
} from './grant'
import { OpenAPI, HttpMethod, ValidateFunction } from 'openapi'
import { createVerifier, httpis, RequestLike } from 'http-message-signatures'
import { KeyObject } from 'crypto'
import { Request as KoaRequest } from 'koa'

export interface AuthService {
  introspect(token: string): Promise<Grant | undefined>
}

interface ServiceDependencies {
  authServerIntrospectionUrl: string
  authOpenApi: OpenAPI
  logger: Logger
  validateResponse: ValidateFunction<GrantJSON>
}

export async function createAuthService(
  deps_: Omit<ServiceDependencies, 'validateResponse'>
): Promise<AuthService> {
  const log = deps_.logger.child({
    service: 'AuthService'
  })
  const validateResponse = deps_.authOpenApi.createResponseValidator<GrantJSON>(
    {
      path: '/introspect',
      method: HttpMethod.POST
    }
  )
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log,
    validateResponse
  }
  return {
    introspect: (token) => introspectToken(deps, token)
  }
}

// Creates a RequestLike object for the http-message-signatures library input
function requestLike(request: KoaRequest): RequestLike {
  return {
    method: request.method,
    headers: request.headers,
    url: request.url
  }
}

async function introspectToken(
  deps: ServiceDependencies,
  token: string
): Promise<Grant | undefined> {
  try {
    // https://datatracker.ietf.org/doc/html/draft-ietf-gnap-resource-servers#section-3.3
    const requestHeaders = {
      'Content-Type': 'application/json'
      // TODO:
      // 'Signature-Input': 'sig1=...'
      // 'Signature': 'sig1=...'
      // 'Digest': 'sha256=...'
    }

    const { status, data, request } = await axios.post(
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

    const keyType: KeyType = 'public' //dc_TODO
    const extractable = false //dc_TODO 
    const typedRequest = requestLike(request)
    const signatures = httpis.parseSignatures(typedRequest)
    const verifications = new Array<Promise<void>>()
    signatures.forEach(({ keyid, alg }, signatureName) => {
      if (!keyid) {
        verifications.push(Promise.reject(new Error(`The signature input is missing the 'keyid' parameter`)))
      } else if (alg !== 'ed25519') {
        verifications.push(Promise.reject(new Error(`The signature parameter 'alg' is using an illegal value '${alg}'. Only 'ed25519' is supported.`)))
      } else {
        verifications.push(new Promise((resolve, reject) => {
          httpis.verify(requestLike(request), {
            format: 'httpbis',
            verifiers: {
              keyid: createVerifier(alg, KeyObject.from({
                algorithm: {
                  name: alg
                },
                extractable: extractable,
                type: keyType,
                usages: []
              }))
            }
          }).then((result) => {
            if (result) {
              resolve()
            } else {
              reject(new Error('signature is not authentic'))
            }
          }).catch((err) => {
            reject(err)
          })
        }))
      }
    })

    let signatureIsAuthentic = false
    try {
      await Promise.all(verifications)
      signatureIsAuthentic = true
    } catch (e) {}

    if (!signatureIsAuthentic) {
      // dc_TODO reject
    }

    assert.ok(
      deps.validateResponse({
        status,
        body: data
      })
    )
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
    return new Grant(options)
  } catch (err) {
    if (err.errors) {
      deps.logger.warn({ err }, 'invalid token introspection')
    }
    return
  }
}
