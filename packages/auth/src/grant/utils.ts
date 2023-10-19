import { IAppConfig } from '../config/app'
import { GrantRequest } from './service'
import {
  isIncomingPaymentAccessRequest,
  isQuoteAccessRequest
} from '../access/types'

export function canSkipInteraction(
  config: IAppConfig,
  body: GrantRequest
): boolean {
  return body.access_token.access.every(
    (access) =>
      (isIncomingPaymentAccessRequest(access) &&
        !config.incomingPaymentInteraction) ||
      (isQuoteAccessRequest(access) && !config.quoteInteraction)
  )
}
