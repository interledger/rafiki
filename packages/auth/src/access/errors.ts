export enum AccessError {
  OnlyOneAccessAmountAllowed = 'only one access amount allowed'
}

export const isAccessError = (o: any): o is AccessError =>
  Object.values(AccessError).includes(o)
