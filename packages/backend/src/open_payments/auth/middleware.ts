import { AccessType, AccessAction } from './grant'
import { PaymentPointerContext } from '../../app'
import { Transaction } from 'objection'
import { GrantReference } from '../grantReference/model'
import { createVerifier, httpis, RequestLike } from 'http-message-signatures'
import { KeyObject } from 'crypto'
import { Request as KoaRequest } from 'koa'
import { ClientKeys } from '../../clientKeys/model'
import { JWKWithRequired } from 'auth'

// Creates a RequestLike object for the http-message-signatures library input
function requestLike(request: KoaRequest): RequestLike {
  return {
    method: request.method,
    headers: request.headers,
    url: request.url
  }
}

function parseJwkKeyType(jwk: JWKWithRequired): KeyType {
  if (jwk.kty === 'private' || jwk.kty === 'public' || jwk.kty === 'secret') {
    return jwk.kty
  } else {
    throw new Error('invalid key type')
  }
}

function parseJwkUsages(jwk: JWKWithRequired): Array<KeyUsage> {
  const { use } = jwk
  if (
    use === 'decrypt' ||
    use === 'deriveBits' ||
    use === 'deriveKey' ||
    use === 'encrypt' ||
    use === 'sign' ||
    use === 'unwrapKey' ||
    use === 'verify' ||
    use === 'wrapKey'
  ) {
    return [use]
  } else if (use === undefined) {
    return []
  } else {
    throw new Error('invalid usage')
  }
}

async function verifyRequest(
  request: KoaRequest,
  jwk: JWKWithRequired
): Promise<void> {
  const keyType = parseJwkKeyType(clientKeys.jwk)
  const typedRequest = requestLike(request)
  const signatures = httpis.parseSignatures(typedRequest)
  for (const [, { keyid, alg }] of signatures) {
    if (!keyid) {
      throw new Error(`The signature input is missing the 'keyid' parameter`)
    } else if (alg !== 'ed25519') {
      throw new Error(
        `The signature parameter 'alg' is using an illegal value '${alg}'. Only 'ed25519' is supported.`
      )
    } else {
      const success = await httpis.verify(requestLike(request), {
        format: 'httpbis',
        verifiers: {
          keyid: createVerifier(
            alg,
            KeyObject.from({
              algorithm: {
                name: alg
              },
              extractable: clientKeys.jwk.ext,
              type: keyType,
              usages: parseJwkUsages(clientKeys.jwk)
            })
          )
        }
      })

      if (!success) {
        throw new Error('signature is not valid')
      }
    }
  }
}

export function createAuthMiddleware({
  type,
  action
}: {
  type: AccessType
  action: AccessAction
}) {
  return async (
    ctx: PaymentPointerContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const config = await ctx.container.use('config')
    const grantReferenceService = await ctx.container.use(
      'grantReferenceService'
    )
    const logger = await ctx.container.use('logger')
    try {
      const parts = ctx.request.headers.authorization?.split(' ')
      if (parts?.length !== 2 || parts[0] !== 'GNAP') {
        ctx.throw(401, 'Unauthorized')
      }
      const token = parts[1]
      if (
        process.env.NODE_ENV !== 'production' &&
        token === config.devAccessToken
      ) {
        await next()
        return
      }
      const authService = await ctx.container.use('authService')
      const grant = await authService.introspect(token)
      if (!grant || !grant.active) {
        ctx.throw(401, 'Invalid Token')
      }
      if (!config.skipSignatureVerification) {
        try {
          const clientKeysService = await ctx.container.use('clientKeysService')
          const clientKeys = await clientKeysService.getKeyByClientId(
            grant.clientId
          )
          await verifyRequest(ctx.request, clientKeys)
        } catch (e) {
          ctx.throw(401, `Invalid signature: ${e.message}`)
        }
      }
      if (
        !grant.includesAccess({
          type,
          action,
          identifier: ctx.paymentPointer.url
        })
      ) {
        ctx.throw(403, 'Insufficient Grant')
      }
      await GrantReference.transaction(async (trx: Transaction) => {
        const grantRef = await grantReferenceService.get(grant.grant, trx)
        if (grantRef) {
          if (grantRef.clientId !== grant.clientId) {
            logger.debug(
              `clientID ${grant.clientId} for grant ${grant.grant} does not match internal reference clientId ${grantRef.clientId}.`
            )
            ctx.throw(500)
          }
        } else {
          await grantReferenceService.create(
            {
              id: grant.grant,
              clientId: grant.clientId
            },
            trx
          )
        }
      })
      ctx.grant = grant
      await next()
    } catch (err) {
      if (err.status === 401) {
        ctx.status = 401
        ctx.message = err.message
        ctx.set('WWW-Authenticate', `GNAP as_uri=${config.authServerGrantUrl}`)
      } else {
        throw err
      }
    }
  }
}
