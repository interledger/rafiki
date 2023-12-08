import { IAppConfig } from '../config/app'
import { GrantRequest } from './service'
import {
  AccessRequest,
  isIncomingPaymentAccessRequest,
  isQuoteAccessRequest
} from '../access/types'
import { AccessAction } from '@interledger/open-payments'

export function canSkipInteraction(
  config: IAppConfig,
  body: GrantRequest
): boolean {
  return body.access_token.access.every(
    (access) =>
      (isIncomingPaymentAccessRequest(access) &&
        !config.incomingPaymentInteraction &&
        (!includesAllAction(access) || !config.allInteraction)) ||
      (isQuoteAccessRequest(access) &&
        !config.quoteInteraction &&
        (!includesAllAction(access) || !config.allInteraction))
  )
}

function includesAllAction(access: AccessRequest): boolean {
  return (
    access.actions.includes(AccessAction.ReadAll) ||
    access.actions.includes(AccessAction.ListAll)
  )
}
