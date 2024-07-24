import { isDeepStrictEqual } from 'util'
import { AccessItem, AccessAction } from '@interledger/open-payments'

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
      requestAccessItemValue !==
      restOfgrantAccessItem[key as keyof typeof restOfgrantAccessItem]
    ) {
      return false
    }
  })

  return true
}
