import { isDeepStrictEqual } from 'util'
import { AccessItem, AccessAction } from '@interledger/open-payments'

type OutgoingPaymentAccess = Extract<AccessItem, { type: 'outgoing-payment' }>
type OutgoingPaymentOrIncomingPaymentAccess = Exclude<
  AccessItem,
  { type: 'quote' }
>

export function compareRequestAndGrantAccessItems(
  requestAccessItem: AccessItem,
  grantAccessItem: AccessItem
): boolean {
  const { actions: requestAccessItemActions, ...restOfRequestAccessItem } =
    requestAccessItem
  const { actions: grantAccessItemActions, ...restOfGrantAccessItem } =
    grantAccessItem

  // Validate action arrays
  for (const actionItem of requestAccessItemActions) {
    if (
      !grantAccessItemActions.find(
        (grantAccessAction) =>
          grantAccessAction === actionItem ||
          (actionItem === AccessAction.Read &&
            grantAccessAction === AccessAction.ReadAll) ||
          (actionItem === AccessAction.List &&
            grantAccessAction === AccessAction.ListAll)
      )
    )
      return false
  }

  // Validate limits object, if included
  if (
    (restOfRequestAccessItem as OutgoingPaymentAccess).limits &&
    !isDeepStrictEqual(
      (restOfRequestAccessItem as OutgoingPaymentAccess).limits,
      (restOfGrantAccessItem as OutgoingPaymentAccess).limits
    )
  ) {
    return false
  }

  // Validate remaining keys
  if (
    restOfRequestAccessItem.type !== restOfGrantAccessItem.type ||
    (restOfRequestAccessItem as OutgoingPaymentOrIncomingPaymentAccess)
      .identifier !==
      (restOfGrantAccessItem as OutgoingPaymentOrIncomingPaymentAccess)
        .identifier
  ) {
    return false
  }

  return true
}
