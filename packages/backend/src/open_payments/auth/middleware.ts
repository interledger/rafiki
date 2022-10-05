import { AccessType, AccessAction } from './grant'
import { PaymentPointerContext } from '../../app'
import { Transaction } from 'objection'
import { GrantReference } from '../grantReference/model'
import {
  createVerifier,
  httpis,
  RequestLike,
  Algorithm as AlgorithmName
} from 'http-message-signatures'
import { Request as KoaRequest } from 'koa'
import { JWKWithRequired } from 'auth'
import {
  ByteSequence,
  InnerList,
  Item,
  parseDictionary,
  serializeDictionary
} from 'structured-headers'

function parseAlgorithmName(alg: string): AlgorithmName {
  if (alg === 'EdDSA' || alg === 'ed25519') {
    // ed25519 is EdDSA
    return 'ed25519'
  } else {
    throw new Error(
      `The signature parameter 'alg' is using an illegal value '${alg}'. Only 'ed25519' ('EdDSA') is supported.`
    )
  }
}

async function verifyRequest(
  koaRequest: KoaRequest,
  jwk: JWKWithRequired,
  key: string
): Promise<void> {
  const { kid, kty } = jwk

  if (kty !== 'OKP') {
    throw new Error('invalid key type')
  }

  if (!koaRequest.headers['signature']) {
    throw new Error('signature is missing')
  }

  if (!koaRequest.headers['signature-input']) {
    throw new Error('signature-input is missing')
  }

  const signatureInputMap = new Map<string, string>()
  signatureInputMap.set('keyid', kid)
  signatureInputMap.set('alg', parseAlgorithmName(jwk.alg))

  const typedRequest: RequestLike = {
    method: koaRequest.method,
    headers: {
      ...koaRequest.headers,
      signature: serializeDictionary(
        new Map<string, Item | InnerList>([
          ...Array.from(
            parseDictionary(koaRequest.headers['signature'].toString())
          ).map(([propKey, propValue]) => {
            return [
              propKey,
              [new ByteSequence(propValue[0].toString()), new Map()]
            ] as [string, Item | InnerList]
          })
        ])
      )
    },
    url: koaRequest.url
  }

  const verifier = createVerifier('ecdsa-p256-sha256', key)
  const signatures = httpis.parseSignatures(typedRequest)

  for (const [, { keyid, alg }] of signatures) {
    if (!keyid) {
      throw new Error(`The signature input is missing the 'keyid' parameter`)
    } else if (alg !== 'ed25519') {
      // ed25519 is EdDSA
      throw new Error(
        `The signature parameter 'alg' is using an illegal value '${alg}'. Only 'ed25519' ('EdDSA') is supported.`
      )
    } else {
      const success = await httpis.verify(typedRequest, {
        format: 'httpbis',
        verifiers: {
          [kid]: verifier
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
          await verifyRequest(ctx.request, clientKeys.jwk, grant.key.proof)
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
