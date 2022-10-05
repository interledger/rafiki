import { AccessType, AccessAction } from './grant'
import { PaymentPointerContext } from '../../app'
import { Transaction } from 'objection'
import { GrantReference } from '../grantReference/model'
import {
  createVerifier,
  httpis,
  verifyContentDigest
} from 'http-message-signatures'
import { Request as KoaRequest } from 'koa'
import { JWKWithRequired } from 'auth'

async function verifyRequest(
  koaRequest: KoaRequest,
  jwk: JWKWithRequired
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

  const verifier = createVerifier('ecdsa-p256-sha256', jwk.x)
  const signatures = httpis.parseSignatures(koaRequest)

  for (const [, { keyid }] of signatures) {
    if (!keyid) {
      throw new Error(`The signature input is missing the 'keyid' parameter`)
    } else if (keyid != kid) {
      throw new Error(
        `The 'keyid' parameter does not match the key id specified by the JWK`
      )
    } else {
      const success = await httpis.verify(koaRequest, {
        format: 'httpbis',
        verifiers: {
          [kid]: verifier
        }
      })

      if (!success || !verifyContentDigest(koaRequest)) {
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
      const tokenInfo = await authService.introspect(token)
      if (!tokenInfo || !tokenInfo.active) {
        ctx.throw(401, 'Invalid Token')
      }
      if (
        !tokenInfo.includesAccess({
          type,
          action,
          identifier: ctx.paymentPointer.url
        })
      ) {
        ctx.throw(403, 'Insufficient Grant')
      }
      try {
        await verifyRequest(ctx.request, tokenInfo.key.jwk)
      } catch (e) {
        ctx.status = 401
        ctx.throw(401, `Invalid signature: ${e.message}`)
      }
      await GrantReference.transaction(async (trx: Transaction) => {
        const grantRef = await grantReferenceService.get(tokenInfo.grant, trx)
        if (grantRef) {
          if (grantRef.clientId !== tokenInfo.clientId) {
            logger.debug(
              `clientID ${tokenInfo.clientId} for grant ${tokenInfo.grant} does not match internal reference clientId ${grantRef.clientId}.`
            )
            ctx.throw(500)
          }
        } else {
          await grantReferenceService.create(
            {
              id: tokenInfo.grant,
              clientId: tokenInfo.clientId
            },
            trx
          )
        }
      })
      ctx.grant = tokenInfo
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
