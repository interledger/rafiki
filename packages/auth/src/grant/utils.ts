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
  return body.access_token.access.every((access) => {
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
  })
}
