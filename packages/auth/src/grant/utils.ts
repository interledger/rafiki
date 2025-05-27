import { IAppConfig } from '../config/app'
import { GrantRequest } from './service'
import {
  isIncomingPaymentAccessRequest,
  isQuoteAccessRequest
} from '../access/types'
import { AccessAction } from '@interledger/open-payments'

export function canSkipInteraction(
  config: IAppConfig,
  body: GrantRequest
): boolean {
  const emptySubject = (body.subject?.sub_ids?.length ?? 0) === 0
  const emptyAccess = (body.access_token?.access?.length ?? 0) === 0

  if (emptySubject && emptyAccess) {
    throw new Error('subject or access_token required')
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
        throw new Error('identifier required')
      }

      return canSkip
    }) || false

  return emptySubject && canSkipAccess
}
