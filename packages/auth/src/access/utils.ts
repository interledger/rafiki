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
    if (
      !grantAccessItemActions.includes(actionItem) &&
        !(actionItem === 'read' && grantAccessItemActions.includes('read-all')) &&
        !(actionItem === 'list' && grantAccessItemActions.includes('list-all'))
    ) return false
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
  const { actions: requestAccessItemActions, ...restOfRequestAccessItem } =
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

  Object.keys(restOfRequestAccessItem).forEach((key) => {
    const requestAccessItemValue =
      restOfRequestAccessItem[key as keyof typeof restOfRequestAccessItem]
    if (
      typeof requestAccessItemValue === 'object' &&
      !isDeepStrictEqual(
        requestAccessItemValue,
        restOfgrantAccessItem[key as keyof typeof restOfgrantAccessItem]
      )
    ) {
      return false
    } else if (
      restOfRequestAccessItem[key as keyof typeof restOfRequestAccessItem] !==
      restOfgrantAccessItem[key as keyof typeof restOfgrantAccessItem]
    ) {
      return false
    }
  })

  return true
}
