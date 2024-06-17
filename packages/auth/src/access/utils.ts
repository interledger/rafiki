import { isDeepStrictEqual } from 'util'
import { AccessItem } from '@interledger/open-payments'
import { Access } from './model'

export function grantHasAccess(
  requestAccessItem: AccessItem,
  grantAccessItem: Access
): boolean {
  const { actions: requestAccessItemActions, ...restOfRequestAccessItem } =
    requestAccessItem
  const { actions: grantAccessItemActions } = grantAccessItem

  for (const actionItem of requestAccessItemActions) {
    if (!grantAccessItemActions.includes(actionItem)) return false
  }
  for (const key of Object.keys(restOfRequestAccessItem)) {
    if (
      restOfRequestAccessItem[key as keyof typeof restOfRequestAccessItem] !==
      grantAccessItem[key as keyof Access]
    )
      return false
  }
  return true
}

export function compareRequestAndGrantAccessItems(
  requestAccessItem: AccessItem,
  grantAccessItem: AccessItem
): boolean {
  const { actions: requestAccessItemActions, ...restOfrequestAccessItem } =
    requestAccessItem
  const { actions: grantAccessItemActions, ...restOfgrantAccessItem } =
    grantAccessItem

  for (const actionItem of requestAccessItemActions) {
    if (
      !grantAccessItemActions.find(
        (grantAccessItem) => grantAccessItem === actionItem
      )
    )
      return false
  }

  return isDeepStrictEqual(restOfrequestAccessItem, restOfgrantAccessItem)
}
