import { JWK } from 'token-introspection'

import { IAppConfig } from '../config/app'
import { GrantRequest, RawClientField } from './service'
import {
  isIncomingPaymentAccessRequest,
  isQuoteAccessRequest
} from '../access/types'
import { AccessAction } from '@interledger/open-payments'
import { GrantError, GrantErrorCode } from './errors'

export type WalletAddressClientField = { client: string; jwk?: never }
export type JwkClientField = { client?: never; jwk: JWK }
export type ParsedClientField = WalletAddressClientField | JwkClientField

/** Extract client identity from a persisted grant record. */
export function getGrantClientIdentity(grant: {
  client?: string
  jwk?: JWK
}): ParsedClientField {
  if (grant.jwk) return { jwk: grant.jwk }
  if (grant.client) return { client: grant.client }
  throw new Error('Grant must have either client or jwk')
}

/** Parse the union client field from an API request body. */
export function parseRawClientField(
  rawClient: RawClientField
): ParsedClientField {
  if (!rawClient) {
    throw new GrantError(GrantErrorCode.InvalidRequest, 'Invalid client field')
  }
  if (typeof rawClient === 'string') {
    return { client: rawClient }
  }
  if ('walletAddress' in rawClient) {
    return { client: rawClient.walletAddress }
  }
  if ('jwk' in rawClient) {
    return { jwk: rawClient.jwk }
  }
  throw new GrantError(GrantErrorCode.InvalidRequest, 'Invalid client field')
}

export function canSkipInteraction(
  config: IAppConfig,
  body: GrantRequest
): boolean {
  const emptySubject = (body.subject?.sub_ids?.length ?? 0) === 0
  const emptyAccess = (body.access_token?.access?.length ?? 0) === 0

  if (emptySubject && emptyAccess) {
    throw new GrantError(
      GrantErrorCode.InvalidRequest,
      'subject or access_token required'
    )
  }

  const canSkipAccess =
    body.access_token?.access.every((access) => {
      const canSkip =
        (isIncomingPaymentAccessRequest(access) &&
          !config.incomingPaymentInteraction &&
          (!access.actions.includes(AccessAction.ListAll) ||
            !config.listAllInteraction)) ||
        (isQuoteAccessRequest(access) &&
          !config.quoteInteraction &&
          (!access.actions.includes(AccessAction.ListAll) ||
            !config.listAllInteraction))

      if (!canSkip && (!access.identifier || access.identifier === '')) {
        throw new GrantError(
          GrantErrorCode.InvalidRequest,
          'access identifier required'
        )
      }

      return canSkip
    }) || false

  return emptySubject && canSkipAccess
}
